import { estimateTokens } from "../stats/TokenEstimate";

/**
 * SessionConsolidator — 세션 단위 저장 시점 부패(rot) 완화 레이어 (팀리드 지시 — 2026-07-24).
 *
 * 배경: rot-bench 코호트 실측에서 세션 축적에 따른 검색 부패가 실증됐다
 * (25→100% 체크포인트에서 naive -12.5pp, governed -14.1pp). 검색 시점 가중
 * (governed retrieval)만으로는 부패 기울기를 눕히지 못하므로, **저장 시점
 * 개입**으로 후보군 자체를 정화한다 — 두 축:
 *   ① 근사중복 supersede — 거의 같은 내용을 반복 저장한 세션은 최신 1개만
 *     검색 후보로 남긴다 (append-only 특유의 중복 누적을 정면 완화).
 *   ② 추출적 증류 — 세션 텍스트를 압축된 core 텍스트로 요약해 후보군의
 *     신호 대 잡음비를 높인다.
 *
 * 순수 함수·결정론: 동일 입력(세션 배열)에 대해 항상 동일 출력을 반환한다
 * (content-token TF 코사인 자체가 결정론적 집계이므로 보장됨).
 * LLM 호출 0 — docs/RULES.md 원칙 2 준수. 외부 의존성 0.
 *
 * 파라미터는 사전 고정이며 벤치 정답에서 역산하지 않았다 — 스윕 금지:
 *   - SUPERSEDE_COSINE_THRESHOLD = 0.90
 *   - DISTILL_MAX_SENTENCES = 5
 *   - DISTILL_MAX_RATIO = 0.30
 *
 * 입력 분포 교정 (2026-07-24): HashedNgram 원문 코사인은 무관 쌍 23.2%≥0.90 로
 * 무효. content-token TF 코사인은 무관 쌍 max 0.314 / 합성 근사중복 min 0.940
 * — 벤치 정답 미사용, 스윕 금지.
 */

export interface ConsolidationInputSession {
  id: string;
  text: string;
  date?: string;
}

export interface ConsolidatedSession {
  id: string;
  /** 원문 그대로 (참고/재구성용) */
  text: string;
  /** 추출적 증류 결과 — supersede 여부와 무관하게 항상 계산 (호출측이 supersede 필터링을 담당) */
  coreText: string;
  date?: string;
  /** 근사중복 클러스터에서 최신본이 아닌 경우, 생존한 최신본의 id */
  supersededBy?: string;
}

export interface ConsolidationStats {
  total: number;
  superseded: number;
  /** coreText 토큰 추정치 / 원문 토큰 추정치 평균 (전체 세션 기준, supersede 무관) */
  avgCompressionRatio: number;
}

export interface ConsolidationResult {
  sessions: ConsolidatedSession[];
  stats: ConsolidationStats;
}

// 현재 옵션 없음 — 근사중복 유사도는 content-token TF 코사인 고정 (교정 근거는 상단 파일 주석 참조).
export type ConsolidationOpts = Record<string, never>;

// 사전 고정, 스윕 금지 — 벤치 정답에서 역산한 상수 아님.
const SUPERSEDE_COSINE_THRESHOLD = 0.9;
const DISTILL_MAX_SENTENCES = 5;
const DISTILL_MAX_RATIO = 0.3;
const DISTILL_MIN_SENTENCES_FOR_VERBATIM = 3;

// O(n^2) 코사인 비교 전제 — n<=1000 (팀리드 지시상 실제 M 은 ~500). 초과 시 경고만
// (호출을 막지는 않는다 — 상한을 넘는 사용은 호출측 책임).
const RECOMMENDED_MAX_SESSIONS = 1000;

class UnionFind {
  private readonly parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]!]!;
      x = this.parent[x]!;
    }
    return x;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[ra] = rb;
  }
}

// LongMemEval haystack_dates 규약("YYYY/MM/DD (Day)")을 우선 파싱하고,
// 그 외 형식은 Date.parse 로 최선 노력 파싱한다 (범용 재사용을 위한 fallback).
function parseDateEpochDay(date?: string): number | null {
  if (!date) return null;
  const m = /^(\d{4})\/(\d{2})\/(\d{2})/.exec(date);
  if (m) {
    const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isFinite(ms) ? Math.floor(ms / 86_400_000) : null;
  }
  const parsed = Date.parse(date);
  return Number.isFinite(parsed) ? Math.floor(parsed / 86_400_000) : null;
}

// 마침표/느낌표/물음표 뒤 공백 또는 개행을 문장 경계로 보는 휴리스틱 분리.
function splitSentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const DISTILL_STOPWORDS = new Set([
  "the", "and", "for", "you", "your", "with", "that", "this", "have", "has",
  "are", "was", "were", "can", "could", "would", "should", "will", "not",
  "but", "all", "any", "some", "there", "here", "what", "when", "where",
  "how", "why", "which", "from", "into", "about", "also", "just", "like",
  "they", "them", "their", "user", "assistant", "date",
]);

function tokenize(text: string): string[] {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 3 && !DISTILL_STOPWORDS.has(t) && !/^\d+$/.test(t));
}

// 근사중복 유사도 전용 불용어 — 영어 기본 불용어 + 대화 역할 마커("user"/"assistant").
// 입력 분포 교정(2026-07-24) 산출 근거는 상단 파일 주석 참조.
const SIMILARITY_STOPWORDS = new Set([
  "the", "and", "for", "you", "your", "with", "that", "this", "have", "has",
  "are", "was", "were", "can", "could", "would", "should", "will", "not",
  "but", "all", "any", "some", "there", "here", "what", "when", "where",
  "how", "why", "which", "from", "into", "about", "also", "just", "like",
  "they", "them", "their", "user", "assistant",
]);

function tokenizeForSimilarity(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9가-힣]+/)
    .filter((t) => t.length >= 3 && !SIMILARITY_STOPWORDS.has(t));
}

/** content-token TF 벡터 — 근사중복 유사도 계산 전용 (증류용 tokenize 와는 독립). */
function tfVector(text: string): Map<string, number> {
  const tf = new Map<string, number>();
  for (const term of tokenizeForSimilarity(text)) tf.set(term, (tf.get(term) ?? 0) + 1);
  return tf;
}

/** TF 벡터 코사인 유사도. 한쪽이라도 빈 벡터면 0. */
function tfCosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let dot = 0;
  for (const [term, freqA] of a) {
    const freqB = b.get(term);
    if (freqB !== undefined) dot += freqA * freqB;
  }
  if (dot === 0) return 0;
  let normA = 0;
  for (const freq of a.values()) normA += freq * freq;
  let normB = 0;
  for (const freq of b.values()) normB += freq * freq;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * 추출적 증류 — 문장 점수 = TF 현저성(세션 내 고빈도 content term 포함도) +
 * 위치 보너스(첫 2문장). 위치 보너스는 해당 세션의 평균 문장 현저성으로
 * 정규화한다(외부 데이터 의존 없는 자기 척도 — 벤치 정답과 무관).
 * 상위 min(5문장, 전체의 30%)를 원 순서로 이어붙인다. 문장 3개 이하면 원문 유지.
 */
function distillSession(text: string): string {
  const sentences = splitSentences(text);
  if (sentences.length <= DISTILL_MIN_SENTENCES_FOR_VERBATIM) return text;

  const tf = new Map<string, number>();
  for (const term of tokenize(text)) tf.set(term, (tf.get(term) ?? 0) + 1);

  const salience = sentences.map((sentence) => {
    const terms = new Set(tokenize(sentence));
    let s = 0;
    for (const term of terms) s += tf.get(term) ?? 0;
    return s;
  });
  const meanSalience = salience.reduce((a, b) => a + b, 0) / sentences.length;

  const scored = sentences.map((sentence, idx) => ({
    idx,
    sentence,
    score: salience[idx]! + (idx < 2 ? meanSalience : 0),
  }));

  const k = Math.min(DISTILL_MAX_SENTENCES, Math.max(1, Math.ceil(sentences.length * DISTILL_MAX_RATIO)));
  const top = [...scored]
    .sort((a, b) => b.score - a.score || a.idx - b.idx) // 동점 결정론 tie-break
    .slice(0, k)
    .sort((a, b) => a.idx - b.idx); // 원 순서 복원

  return top.map((t) => t.sentence).join(" ");
}

/**
 * 세션 배열을 정화한다 — 근사중복 supersede + 추출적 증류.
 * 순수 함수: 입력을 변경하지 않고 새 결과를 반환한다.
 */
export function consolidateSessions(
  sessions: ConsolidationInputSession[],
  _opts: ConsolidationOpts = {},
): ConsolidationResult {
  const n = sessions.length;
  if (n > RECOMMENDED_MAX_SESSIONS) {
    console.warn(
      `consolidateSessions: O(n^2) 코사인 비교 전제(n<=${RECOMMENDED_MAX_SESSIONS})를 초과했습니다 (n=${n}) — 성능 저하 가능.`,
    );
  }

  const vectors = sessions.map((s) => tfVector(s.text));
  const uf = new UnionFind(n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (tfCosineSimilarity(vectors[i]!, vectors[j]!) >= SUPERSEDE_COSINE_THRESHOLD) uf.union(i, j);
    }
  }

  const clusters = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = uf.find(i);
    const arr = clusters.get(root);
    if (arr) arr.push(i);
    else clusters.set(root, [i]);
  }

  const epochDays = sessions.map((s) => parseDateEpochDay(s.date));
  const supersededBy = new Array<string | undefined>(n).fill(undefined);
  for (const members of clusters.values()) {
    if (members.length <= 1) continue;
    let winner = members[0]!;
    for (const idx of members.slice(1)) {
      const a = epochDays[idx] ?? Number.NEGATIVE_INFINITY;
      const b = epochDays[winner] ?? Number.NEGATIVE_INFINITY;
      // 날짜 최신 우선, 동률(둘 다 미정 포함)이면 배열상 뒤쪽 index 를 최신으로 간주 — 결정론 tie-break.
      if (a > b || (a === b && idx > winner)) winner = idx;
    }
    for (const idx of members) {
      if (idx !== winner) supersededBy[idx] = sessions[winner]!.id;
    }
  }

  const outSessions: ConsolidatedSession[] = sessions.map((s, i) => ({
    id: s.id,
    text: s.text,
    coreText: distillSession(s.text),
    date: s.date,
    supersededBy: supersededBy[i],
  }));

  const supersededCount = outSessions.filter((s) => s.supersededBy !== undefined).length;
  const ratios = outSessions.map((s) => {
    const orig = estimateTokens(s.text);
    const core = estimateTokens(s.coreText);
    return orig > 0 ? core / orig : 1;
  });
  const avgCompressionRatio = ratios.length > 0 ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0;

  return {
    sessions: outSessions,
    stats: { total: n, superseded: supersededCount, avgCompressionRatio },
  };
}
