import { SearchIndex } from "../search/SearchIndex";
import type { Embedder } from "../search/Embedder";
import { parseTemporalWindow } from "../search/TemporalQuery";
import type { WikiPage } from "../wiki/types";
import type { SearchMode } from "./types";

/**
 * LongMemEval retrieval-only 트랙 (V3.29 ①).
 *
 * LongMemEval (Wu et al., ICLR 2025 — xiaowu0162/LongMemEval, MIT) 은 장기
 * 메모리 QA 벤치마크다. 공식 QA accuracy 는 LLM 이 필요하지만, 각 질문에
 * `answer_session_ids` (근거 세션 라벨) 가 있어 **retrieval 품질을 LLM 없이**
 * 측정할 수 있다 — 논문 §4.2 의 session-level Recall@K 와 동일한 프로토콜.
 *
 * docs/RULES.md 원칙 2 준수: 본 모듈은 LLM API 를 호출하지 않는다.
 * 질문별 haystack 세션을 SearchIndex 문서로 인덱싱 → 질문 텍스트로 검색 →
 * top-k 안의 근거 세션 비율 (Recall@K) + MRR 을 fts / hybrid 두 모드로 비교.
 */

/** 대화 turn — LongMemEval JSON 원형 */
export interface LmeTurn {
  role: string;
  content: string;
  has_answer?: boolean;
}

export interface LmeQuestion {
  question_id: string;
  question_type: string;
  question: string;
  answer?: unknown;
  question_date?: string;
  haystack_session_ids: string[];
  haystack_dates?: string[];
  haystack_sessions: LmeTurn[][];
  answer_session_ids: string[];
}

export interface LmeRetrievalOpts {
  embedder: Embedder;
  /** recall 측정 k 목록 (기본 [1, 3, 5, 10]) */
  ks?: number[];
  /** 평가할 질문 수 상한 (smoke run 용) */
  limit?: number;
}

export interface LmeModeMetrics {
  mode: SearchMode;
  /** k → macro session-level recall@k */
  recallAtK: Record<number, number>;
  /** 첫 근거 세션 기준 MRR (top-max(k) 밖 = 0) */
  mrr: number;
}

export interface LmeTypeBreakdown {
  questionType: string;
  caseCount: number;
  modes: LmeModeMetrics[];
}

export interface LmeRetrievalResult {
  dataset: string;
  evaluated: number;
  /** abstention (`_abs`) 등 근거 라벨이 없어 제외된 질문 수 */
  skippedNoEvidence: number;
  /** `_abs` 접미 문항 수 (근거 라벨이 있어 평가에는 포함 — V3.30 분리 집계) */
  abstentionCount: number;
  ks: number[];
  /** 기존 프로토콜 그대로 (abs 포함) — run 간 추이 비교용 */
  overall: LmeModeMetrics[];
  /** abs 제외 집계 (V3.30) — abs 문항이 없으면 overall 과 동일 */
  overallExcludingAbstention: LmeModeMetrics[];
  byType: LmeTypeBreakdown[];
}

const DEFAULT_KS = [1, 3, 5, 10];

// question_id 는 파일 경로 (jobs/<id>.job.md, answers/<id>.json) 에 그대로
// 쓰인다 — 외부 데이터셋이 입력이므로 path traversal 방어로 slug 형식 강제.
const SAFE_ID_RE = /^[A-Za-z0-9_-]+$/;

export function parseLmeQuestions(raw: unknown): LmeQuestion[] {
  if (!Array.isArray(raw)) throw new Error("LongMemEval data: root must be an array");
  return raw.map((q, i) => {
    const r = q as Record<string, unknown>;
    if (typeof r.question_id !== "string" || typeof r.question !== "string") {
      throw new Error(`LongMemEval data: entry ${i} missing question_id/question`);
    }
    if (!SAFE_ID_RE.test(r.question_id)) {
      throw new Error(`LongMemEval data: entry ${i} unsafe question_id (path traversal 방어): ${JSON.stringify(r.question_id)}`);
    }
    if (!Array.isArray(r.haystack_sessions) || !Array.isArray(r.haystack_session_ids)) {
      throw new Error(`LongMemEval data: entry ${i} missing haystack fields`);
    }
    if (r.haystack_sessions.length !== r.haystack_session_ids.length) {
      throw new Error(`LongMemEval data: entry ${i} haystack length mismatch`);
    }
    return {
      question_id: r.question_id,
      question_type: typeof r.question_type === "string" ? r.question_type : "unknown",
      question: r.question,
      answer: r.answer,
      question_date: typeof r.question_date === "string" ? r.question_date : undefined,
      haystack_session_ids: r.haystack_session_ids as string[],
      haystack_dates: Array.isArray(r.haystack_dates) ? (r.haystack_dates as string[]) : undefined,
      haystack_sessions: r.haystack_sessions as LmeTurn[][],
      answer_session_ids: Array.isArray(r.answer_session_ids) ? (r.answer_session_ids as string[]) : [],
    };
  });
}

const WEEKDAY_FULL: Record<string, string> = {
  Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday",
  Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
};

// "(Tue)" 축약 요일에 전체명 병기 — 질문의 "tuesday*" prefix 가 "(Tue)" 토큰과
// 매치 불가하던 문제 (진단 temporal 패턴 3). 데이터에 이미 있는 정보의 표기
// 변환일 뿐 정답 주입이 아니다.
function expandWeekday(date: string): string {
  return date.replace(/\((Mon|Tue|Wed|Thu|Fri|Sat|Sun)\)/, (_, abbr: string) => `${WEEKDAY_FULL[abbr]} (${abbr})`);
}

/** 세션 turn 배열 → 인덱싱용 단일 텍스트. 날짜가 있으면 앞에 붙인다 (temporal 질문 보조). */
export function sessionToText(turns: LmeTurn[], date?: string): string {
  const body = turns
    .filter((t) => typeof t.content === "string" && t.content.length > 0)
    .map((t) => `${t.role}: ${t.content}`)
    .join("\n");
  return date ? `[date: ${expandWeekday(date)}]\n${body}` : body;
}

/** user 발화만 모은 텍스트 (V3.30) — bodyUser bm25 가중용. */
export function sessionToUserText(turns: LmeTurn[]): string {
  return turns
    .filter((t) => t.role === "user" && typeof t.content === "string" && t.content.length > 0)
    .map((t) => t.content)
    .join("\n");
}

interface PerQuestionRanks {
  questionType: string;
  isAbstention: boolean;
  /** mode → 근거 세션들의 1-based rank 목록 (top-depth 밖 근거는 미포함) */
  ranksByMode: Record<SearchMode, number[]>;
  evidenceCount: number;
}

export function evalLmeRetrieval(
  questions: LmeQuestion[],
  opts: LmeRetrievalOpts,
): LmeRetrievalResult {
  const ks = [...(opts.ks ?? DEFAULT_KS)].sort((a, b) => a - b);
  const depth = ks[ks.length - 1]!;
  const pool = opts.limit ? questions.slice(0, opts.limit) : questions;

  let skippedNoEvidence = 0;
  const perQuestion: PerQuestionRanks[] = [];

  for (const q of pool) {
    if (q.answer_session_ids.length === 0) {
      skippedNoEvidence++; // abstention 류 — retrieval 근거 정의 불가
      continue;
    }
    // 실데이터에 haystack 내 중복 session id 존재 — 첫 등장만 인덱싱 (dedupe)
    const seen = new Set<string>();
    const pages: WikiPage[] = [];
    q.haystack_session_ids.forEach((sid, i) => {
      if (seen.has(sid)) return;
      seen.add(sid);
      pages.push({
        path: `sessions/${sid}.md`,
        frontmatter: { id: sid, type: "concept", status: "active", updated_at: "2026-01-01" },
        body: sessionToText(q.haystack_sessions[i] ?? [], q.haystack_dates?.[i]),
        bodyUser: sessionToUserText(q.haystack_sessions[i] ?? []),
        claimIds: [],
        evidence: [],
      });
    });

    const index = new SearchIndex(":memory:");
    index.rebuild({ wikiPages: pages, claims: [], embedder: opts.embedder });

    // temporal 상대시간 표현 → 날짜 창 soft filter (V3.30)
    const dateWindow = q.question_date
      ? parseTemporalWindow(q.question, q.question_date) ?? undefined
      : undefined;

    const evidence = new Set(q.answer_session_ids);
    const ranksByMode = {
      fts: ranksOf(
        index.searchWiki(q.question, { limit: depth, dateWindow }).map((h) => h.pageId),
        evidence,
      ),
      hybrid: ranksOf(
        index
          .searchWikiHybrid(q.question, opts.embedder, { limit: depth, dateWindow, fusion: "rescue-rerank" })
          .map((h) => h.pageId),
        evidence,
      ),
    };
    index.close();

    perQuestion.push({
      questionType: q.question_type,
      isAbstention: q.question_id.endsWith("_abs"),
      ranksByMode,
      evidenceCount: evidence.size,
    });
  }

  const types = Array.from(new Set(perQuestion.map((p) => p.questionType))).sort();
  const nonAbs = perQuestion.filter((p) => !p.isAbstention);
  return {
    dataset: "LongMemEval",
    evaluated: perQuestion.length,
    skippedNoEvidence,
    abstentionCount: perQuestion.length - nonAbs.length,
    ks,
    overall: aggregate(perQuestion, ks),
    overallExcludingAbstention: aggregate(nonAbs, ks),
    byType: types.map((t) => {
      const subset = perQuestion.filter((p) => p.questionType === t);
      return { questionType: t, caseCount: subset.length, modes: aggregate(subset, ks) };
    }),
  };
}

function ranksOf(rankedIds: string[], evidence: ReadonlySet<string>): number[] {
  const ranks: number[] = [];
  rankedIds.forEach((id, i) => {
    if (evidence.has(id)) ranks.push(i + 1);
  });
  return ranks;
}

function aggregate(items: PerQuestionRanks[], ks: number[]): LmeModeMetrics[] {
  const modes: SearchMode[] = ["fts", "hybrid"];
  return modes.map((mode) => {
    const recallAtK: Record<number, number> = {};
    for (const k of ks) {
      let sum = 0;
      for (const it of items) {
        const found = it.ranksByMode[mode].filter((r) => r <= k).length;
        sum += found / it.evidenceCount;
      }
      recallAtK[k] = items.length === 0 ? 0 : sum / items.length;
    }
    let mrrSum = 0;
    for (const it of items) {
      const first = it.ranksByMode[mode][0];
      if (first !== undefined) mrrSum += 1 / first;
    }
    return { mode, recallAtK, mrr: items.length === 0 ? 0 : mrrSum / items.length };
  });
}

/** 결과 → memory/reports/ markdown. */
export function renderLmeReport(result: LmeRetrievalResult, generatedAt: string): string {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const header = `| mode | ${result.ks.map((k) => `R@${k}`).join(" | ")} | MRR |`;
  const sep = `|---|${result.ks.map(() => "---").join("|")}|---|`;
  const row = (m: LmeModeMetrics) =>
    `| ${m.mode} | ${result.ks.map((k) => pct(m.recallAtK[k] ?? 0)).join(" | ")} | ${m.mrr.toFixed(3)} |`;

  const lines = [
    `# LongMemEval Retrieval Benchmark (session-level)`,
    ``,
    `> 생성: ${generatedAt} · 평가 ${result.evaluated} 문항 (근거 라벨 없는 ${result.skippedNoEvidence} 문항 제외, abstention ${result.abstentionCount} 문항 포함)`,
    `> 프로토콜: 질문별 haystack 세션 인덱싱 → 질문 검색 → answer_session_ids 대비 Recall@K.`,
    `> LLM 호출 0 (retrieval-only 트랙). 실행: \`bun run bench:lme\``,
    `> harness V3.30: content 쿼리 + rescue-rerank + temporal 날짜창 + user-turn 가중 + 요일 병기`,
    ``,
    `## Overall (abs 포함 — run 간 추이 비교용)`,
    ``,
    header,
    sep,
    ...result.overall.map(row),
    ``,
    `## Overall (abstention 제외)`,
    ``,
    header,
    sep,
    ...result.overallExcludingAbstention.map(row),
    ``,
    `## Question type 별`,
    ``,
  ];
  for (const t of result.byType) {
    lines.push(`### ${t.questionType} (${t.caseCount})`, ``, header, sep, ...t.modes.map(row), ``);
  }
  return lines.join("\n");
}
