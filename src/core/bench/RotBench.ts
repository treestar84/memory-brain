import { SearchIndex } from "../search/SearchIndex";
import type { Embedder } from "../search/Embedder";
import type { WikiPage } from "../wiki/types";
import { estimateTokens } from "../stats/TokenEstimate";
import { type LmeQuestion, type LmeTurn, sessionToText, retrieveTopSessions } from "./LongMemEval";

/**
 * 메모리 부패(rot) 벤치마크 (팀리드 지시 — 2026-07-24).
 *
 * 주장: "append-only 메모리는 축적될수록 검색이 부패하고, memory-brain 의
 * governed retrieval 은 강건하다." 본 모듈은 이 주장을 실측한다 — 결과가
 * 어느 방향이든 있는 그대로 보고하며, 유리한 방향의 튜닝 상수를 도입하지
 * 않는다 (docs/BENCHMARK.md §3 금지 사항과 동일 원칙).
 *
 * 측정 한계 (자진 명시): 체크포인트는 haystack 세션 **수** 비율(f)이며,
 * 달력 경과(일/주/개월)를 통제한 실측이 아니다 — "세션 축적에 따른 검색
 * 강건성" 측정이다.
 *
 * LongMemEval.ts 의 기존 export (parseLmeQuestions, retrieveTopSessions,
 * sessionToText 등) 를 그대로 재사용하고, 본 파일은 추가 전용이다 —
 * LongMemEval.ts 는 수정하지 않는다.
 */

/** 부패 측정 체크포인트 — haystack 세션 누적 비율 f. */
export const ROT_CHECKPOINTS: readonly number[] = [0.25, 0.5, 0.75, 1.0];

export type RotCondition = "naive" | "governed";
export type RotOrder = "date" | "seed";

interface SessionRef {
  sid: string;
  turns: LmeTurn[];
  date?: string;
  epochDay: number | null;
}

// haystack_dates 는 "YYYY/MM/DD (Day)" 형식 (LongMemEval.ts 의 extractBodyEpochDay
// 와 동일 규약). 날짜 문자열 자체(접두 "[date: " 없는 raw)를 직접 파싱한다.
function parseDateEpochDay(date: string): number | null {
  const m = /^(\d{4})\/(\d{2})\/(\d{2})/.exec(date);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) ? Math.floor(ms / 86_400_000) : null;
}

/**
 * haystack 세션을 지정 순서로 정렬한 참조 배열로 변환.
 * "date": 파싱된 날짜 오름차순 (날짜 파싱 불가 항목은 맨 뒤, 원 순서 유지 — stable).
 * "seed": 데이터셋 원 순서 그대로 (재정렬 없음).
 */
export function orderedHaystack(q: LmeQuestion, order: RotOrder = "date"): SessionRef[] {
  const refs: SessionRef[] = q.haystack_session_ids.map((sid, i) => {
    const date = q.haystack_dates?.[i];
    return { sid, turns: q.haystack_sessions[i] ?? [], date, epochDay: date ? parseDateEpochDay(date) : null };
  });
  if (order === "seed") return refs;
  return refs
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const da = a.r.epochDay ?? Number.POSITIVE_INFINITY;
      const db = b.r.epochDay ?? Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      return a.i - b.i; // tie-break — 결정론 보장
    })
    .map(({ r }) => r);
}

/**
 * 체크포인트 f 에서의 부분 haystack 질문 구성 (질문·근거 라벨은 그대로,
 * haystack 만 앞쪽 ⌈f·N⌉개로 슬라이스). `answer_session_ids` 전부가
 * 슬라이스에 포함될 때만 반환 — 미포함이면 null (호출측에서 skip 처리).
 */
export function sliceAtCheckpoint(q: LmeQuestion, f: number, order: RotOrder = "date"): LmeQuestion | null {
  const ordered = orderedHaystack(q, order);
  const n = Math.max(1, Math.ceil(f * ordered.length));
  const slice = ordered.slice(0, n);
  const sliceIds = new Set(slice.map((r) => r.sid));
  if (q.answer_session_ids.length === 0 || !q.answer_session_ids.every((id) => sliceIds.has(id))) return null;
  return {
    ...q,
    haystack_session_ids: slice.map((r) => r.sid),
    haystack_sessions: slice.map((r) => r.turns),
    haystack_dates: q.haystack_dates ? slice.map((r) => r.date ?? "") : undefined,
  };
}

/**
 * naive 조건 — append-only 덤프형 검색 대변. lexical+vector hybrid 는
 * 유지하되 (strawman 방지), dateWindow(temporal 창)/body_user 가중/PRF
 * 쿼리 확장/rescue-rerank 를 전부 배제한다 (fusion="rescue" 만 사용).
 *
 * SearchIndex.searchWiki 는 body_user 컬럼에 고정 bm25 가중을 항상 적용
 * (opt-out 불가)하므로, bodyUser 를 비워 두어 가중이 0 기여가 되게 한다 —
 * LongMemEval.ts 기존 코드 수정 없이 "가중 미적용"을 재현하는 방법이다.
 */
export function retrieveNaive(q: LmeQuestion, embedder: Embedder, opts: { depth?: number } = {}): string[] {
  const depth = opts.depth ?? 10;
  const seen = new Set<string>();
  const pages: WikiPage[] = [];
  q.haystack_session_ids.forEach((sid, i) => {
    if (seen.has(sid)) return;
    seen.add(sid);
    const turns = q.haystack_sessions[i] ?? [];
    pages.push({
      path: `sessions/${sid}.md`,
      frontmatter: { id: sid, type: "concept", status: "active", updated_at: "2026-01-01" },
      body: sessionToText(turns, q.haystack_dates?.[i]),
      bodyUser: "",
      claimIds: [],
      evidence: [],
    });
  });

  const index = new SearchIndex(":memory:");
  index.rebuild({ wikiPages: pages, claims: [], embedder });
  const result = index
    .searchWikiHybrid(q.question, embedder, { limit: depth, fusion: "rescue" })
    .map((h) => h.pageId);
  index.close();
  return result;
}

export interface RotCaseResult {
  questionId: string;
  questionType: string;
  checkpoint: number;
  condition: RotCondition;
  /** 정답 세션 중 최소 1개가 top-5 안에 있으면 true (질문 단위 이진 hit) */
  hit: boolean;
  /** 첫 정답 세션의 역순위 (top-depth 밖이면 0) */
  reciprocalRank: number;
  /** top-5 세션 텍스트의 estimateTokens 추정 합 */
  top5Tokens: number;
}

function scoreRanked(ranked: string[], q: LmeQuestion): { hit: boolean; reciprocalRank: number; top5Tokens: number } {
  const evidence = new Set(q.answer_session_ids);
  const top5 = ranked.slice(0, 5);
  const hit = top5.some((sid) => evidence.has(sid));
  let reciprocalRank = 0;
  for (let i = 0; i < ranked.length; i++) {
    if (evidence.has(ranked[i]!)) {
      reciprocalRank = 1 / (i + 1);
      break;
    }
  }
  const textById = new Map<string, string>();
  q.haystack_session_ids.forEach((sid, i) => {
    if (!textById.has(sid)) textById.set(sid, sessionToText(q.haystack_sessions[i] ?? [], q.haystack_dates?.[i]));
  });
  const top5Tokens = top5.reduce((sum, sid) => sum + estimateTokens(textById.get(sid) ?? ""), 0);
  return { hit, reciprocalRank, top5Tokens };
}

export interface RotAggregateCell {
  checkpoint: number;
  condition: RotCondition;
  caseCount: number;
  recallAt5: number;
  mrr: number;
  avgTop5Tokens: number;
}

export interface RotTypeCell extends RotAggregateCell {
  questionType: string;
}

export interface RotBenchResult {
  dataset: string;
  checkpoints: number[];
  totalQuestions: number;
  /** checkpoint → 평가된 질문 수 (조건과 무관 — haystack 커버리지만으로 결정) */
  evaluatedByCheckpoint: Record<number, number>;
  /** checkpoint → skip 된 질문 수 (근거 라벨 없음 포함) */
  skippedByCheckpoint: Record<number, number>;
  aggregates: RotAggregateCell[];
  byType: RotTypeCell[];
  cases: RotCaseResult[];
  /** "all": 기존 동작 (체크포인트별 독립 커버리지). "cohort": 4개 체크포인트 전부에서
   * 평가 가능한 문항만 포함 — 동일 집단으로 순수 부패 곡선을 만든다. */
  mode: "all" | "cohort";
  /** cohort 모드에서 체크포인트 중 하나라도 answer 커버리지가 없어 통째로 제외된 문항 수. */
  cohortExcluded?: number;
}

export interface RotBenchOpts {
  embedder: Embedder;
  checkpoints?: number[];
  limit?: number;
  order?: RotOrder;
  /** true 면 cohort 모드 — 4개 체크포인트 전부에서 평가 가능한 문항만 포함해
   * 동일 문항 집단으로 체크포인트 간 직접 비교가 가능해진다 (기본 false — 기존 동작 무변경). */
  cohort?: boolean;
  onProgress?: (done: number, total: number) => void;
}

function aggregateCells(cases: RotCaseResult[], checkpoints: number[]): RotAggregateCell[] {
  const out: RotAggregateCell[] = [];
  for (const f of checkpoints) {
    for (const condition of ["naive", "governed"] as const) {
      const subset = cases.filter((c) => c.checkpoint === f && c.condition === condition);
      const n = subset.length;
      out.push({
        checkpoint: f,
        condition,
        caseCount: n,
        recallAt5: n === 0 ? 0 : subset.filter((c) => c.hit).length / n,
        mrr: n === 0 ? 0 : subset.reduce((s, c) => s + c.reciprocalRank, 0) / n,
        avgTop5Tokens: n === 0 ? 0 : subset.reduce((s, c) => s + c.top5Tokens, 0) / n,
      });
    }
  }
  return out;
}

/**
 * 스트리밍 로더용 accumulator — 질문을 배열로 한꺼번에 들고 있지 않고
 * 1건씩 받아 즉시 평가·집계하기 위한 상태 컨테이너. `createRotBenchAccumulator`
 * 로 생성하고 `addQuestionToRotBench` 로 질문을 하나씩 투입한 뒤
 * `finalizeRotBench` 로 최종 결과를 얻는다. 대용량 데이터셋(수 GB)을
 * 스트리밍 파싱할 때 질문 객체 자체는 평가 직후 버릴 수 있도록 하는 것이
 * 목적이다 (`bin/cfgm-rot-bench.ts` 참고).
 */
export interface RotBenchAccumulator {
  readonly checkpoints: number[];
  readonly order: RotOrder;
  readonly embedder: Embedder;
  readonly mode: "all" | "cohort";
  readonly evaluatedByCheckpoint: Record<number, number>;
  readonly skippedByCheckpoint: Record<number, number>;
  readonly cases: RotCaseResult[];
  totalQuestions: number;
  cohortExcluded: number;
}

export function createRotBenchAccumulator(opts: RotBenchOpts): RotBenchAccumulator {
  const checkpoints = [...(opts.checkpoints ?? ROT_CHECKPOINTS)].sort((a, b) => a - b);
  const evaluatedByCheckpoint: Record<number, number> = {};
  const skippedByCheckpoint: Record<number, number> = {};
  for (const f of checkpoints) {
    evaluatedByCheckpoint[f] = 0;
    skippedByCheckpoint[f] = 0;
  }
  return {
    checkpoints,
    order: opts.order ?? "date",
    embedder: opts.embedder,
    mode: opts.cohort ? "cohort" : "all",
    evaluatedByCheckpoint,
    skippedByCheckpoint,
    cases: [],
    totalQuestions: 0,
    cohortExcluded: 0,
  };
}

/** 체크포인트 f 의 부분 질문을 naive/governed 두 조건으로 평가해 case 를 누적한다. */
function evaluateAtCheckpoint(acc: RotBenchAccumulator, q: LmeQuestion, partial: LmeQuestion, f: number): void {
  for (const condition of ["naive", "governed"] as const) {
    const ranked =
      condition === "naive"
        ? retrieveNaive(partial, acc.embedder, { depth: 10 })
        : retrieveTopSessions(partial, acc.embedder, { depth: 10, prf: true });
    const { hit, reciprocalRank, top5Tokens } = scoreRanked(ranked, partial);
    acc.cases.push({
      questionId: q.question_id,
      questionType: q.question_type,
      checkpoint: f,
      condition,
      hit,
      reciprocalRank,
      top5Tokens,
    });
  }
}

/** 질문 1건을 체크포인트×조건으로 평가해 accumulator 에 누적한다 (순수 부수효과 함수). */
export function addQuestionToRotBench(acc: RotBenchAccumulator, q: LmeQuestion): void {
  acc.totalQuestions++;
  if (q.answer_session_ids.length === 0) {
    // abstention 류 — 근거 라벨이 없어 체크포인트 커버리지 판정 불가.
    for (const f of acc.checkpoints) acc.skippedByCheckpoint[f]!++;
    if (acc.mode === "cohort") acc.cohortExcluded++;
    return;
  }

  if (acc.mode === "cohort") {
    // 코호트 모드 — 4개 체크포인트 전부에서 answer 커버리지가 있어야 포함.
    // 체크포인트 슬라이스는 f 오름차순으로 nested(prefix superset)이므로 이론상
    // 최소 체크포인트 통과 여부만으로 충분하지만, 안전하게 전 체크포인트를 검사한다.
    const slices = new Map<number, LmeQuestion>();
    let allCovered = true;
    for (const f of acc.checkpoints) {
      const partial = sliceAtCheckpoint(q, f, acc.order);
      if (!partial) {
        allCovered = false;
        break;
      }
      slices.set(f, partial);
    }
    if (!allCovered) {
      for (const f of acc.checkpoints) acc.skippedByCheckpoint[f]!++;
      acc.cohortExcluded++;
      return;
    }
    for (const f of acc.checkpoints) {
      acc.evaluatedByCheckpoint[f]!++;
      evaluateAtCheckpoint(acc, q, slices.get(f)!, f);
    }
    return;
  }

  for (const f of acc.checkpoints) {
    const partial = sliceAtCheckpoint(q, f, acc.order);
    if (!partial) {
      acc.skippedByCheckpoint[f]!++;
      continue;
    }
    acc.evaluatedByCheckpoint[f]!++;
    evaluateAtCheckpoint(acc, q, partial, f);
  }
}

/** accumulator 를 최종 `RotBenchResult` 로 집계한다. */
export function finalizeRotBench(acc: RotBenchAccumulator): RotBenchResult {
  const { checkpoints, cases } = acc;
  if (acc.mode === "cohort") {
    const ns = checkpoints.map((f) => acc.evaluatedByCheckpoint[f]!);
    if (new Set(ns).size > 1) {
      throw new Error(
        `cohort 모드 불변식 위반 — 체크포인트별 평가 n 이 동일해야 한다: ${JSON.stringify(acc.evaluatedByCheckpoint)}`,
      );
    }
  }
  const aggregates = aggregateCells(cases, checkpoints);
  const types = Array.from(new Set(cases.map((c) => c.questionType))).sort();
  const byType: RotTypeCell[] = [];
  for (const t of types) {
    const subset = cases.filter((c) => c.questionType === t);
    for (const cell of aggregateCells(subset, checkpoints)) {
      byType.push({ ...cell, questionType: t });
    }
  }

  return {
    dataset: "LongMemEval-RotBench",
    checkpoints,
    totalQuestions: acc.totalQuestions,
    evaluatedByCheckpoint: acc.evaluatedByCheckpoint,
    skippedByCheckpoint: acc.skippedByCheckpoint,
    aggregates,
    byType,
    cases,
    mode: acc.mode,
    cohortExcluded: acc.mode === "cohort" ? acc.cohortExcluded : undefined,
  };
}

/**
 * rot 벤치마크 본체 — 질문별 체크포인트×조건 평가 후 집계.
 * 순수 함수 (SearchIndex 는 함수 내부에서 `:memory:` 로 생성·폐기).
 * 내부적으로 accumulator 경로(`createRotBenchAccumulator`/`addQuestionToRotBench`)
 * 를 사용하는 wrapper — 배열을 미리 들고 있는 기존 호출측(테스트 포함)과의
 * 하위 호환을 위해 유지한다. 대용량 스트리밍 입력에는 accumulator 를 직접 쓸 것.
 */
export function runRotBench(questions: LmeQuestion[], opts: RotBenchOpts): RotBenchResult {
  const pool = opts.limit ? questions.slice(0, opts.limit) : questions;
  const acc = createRotBenchAccumulator(opts);
  pool.forEach((q, qi) => {
    addQuestionToRotBench(acc, q);
    opts.onProgress?.(qi + 1, pool.length);
  });
  return finalizeRotBench(acc);
}

/** 결과 → memory/reports/ markdown. */
export function renderRotBenchReport(result: RotBenchResult, generatedAt: string): string {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const header = `| checkpoint | 조건 | n | R@5(hit) | MRR | top-5 평균 토큰(추정) |`;
  const sep = `|---|---|---|---|---|---|`;
  const row = (c: RotAggregateCell) =>
    `| ${(c.checkpoint * 100).toFixed(0)}% | ${c.condition} | ${c.caseCount} | ${pct(c.recallAt5)} | ${c.mrr.toFixed(3)} | ${c.avgTop5Tokens.toFixed(0)} |`;

  const modeLabel = result.mode === "cohort" ? "cohort (동일 문항 집단)" : "all (체크포인트별 독립 커버리지)";
  const lines: string[] = [
    `# Memory Rot Benchmark (session 축적 강건성)`,
    ``,
    `> 생성: ${generatedAt} · 총 문항 ${result.totalQuestions} · 모드: ${modeLabel}`,
    `> 주장: "append-only 메모리는 축적될수록 검색이 부패하고, memory-brain 의`,
    `> governed retrieval 은 강건하다." 본 리포트는 이 주장을 있는 그대로`,
    `> 실측한다 — 결과가 어느 방향이든 튜닝 없이 보고한다.`,
    ``,
    ...(result.mode === "cohort"
      ? [
          `> **코호트 모드**: 25/50/75/100% 체크포인트 전부에서 answer 세션이 커버되는`,
          `> 문항만 포함해 동일 문항 집단(n=${result.evaluatedByCheckpoint[result.checkpoints[0]!] ?? 0})으로`,
          `> 체크포인트 간 직접 비교가 가능하다 — 코호트 혼동 제거. 제외 문항 수:`,
          `> ${result.cohortExcluded ?? 0}.`,
          ``,
        ]
      : []),
    `## 측정 정의`,
    ``,
    `- **체크포인트**: 질문별 haystack 세션을 날짜 오름차순 정렬 후 (\`--seed-order\``,
    `  시 데이터셋 원 순서 그대로 사용), f ∈ {${result.checkpoints.map((f) => `${(f * 100).toFixed(0)}%`).join(", ")}}`,
    `  에서 앞쪽 ⌈f·N⌉개 세션만 포함하는 부분 haystack 을 구성한다.`,
    `- **평가/스킵**: 해당 체크포인트에 \`answer_session_ids\` 전부가 포함될`,
    `  때만 평가하고, 아니면 skip 한다 (근거 세션이 아직 등장하지 않은 시점을`,
    `  "정답 없음"으로 채점하지 않기 위함).`,
    `- **cohort 모드**: 4개 체크포인트 전부에서 평가 가능한 문항만 포함한다 —`,
    `  하나라도 커버되지 않으면 문항 전체를 제외한다 (\`cohortExcluded\`). 모든`,
    `  체크포인트의 n 이 동일해야 한다는 불변식을 finalize 시점에 검증한다.`,
    `- **naive 조건** (append-only 덤프형 대변): lexical+vector hybrid 검색`,
    `  (fusion=rescue) 만 사용 — dateWindow(temporal 창), body_user 가중,`,
    `  PRF 쿼리 확장, rescue-rerank 미적용.`,
    `- **governed 조건**: memory-brain V3.32 확정 구성 (\`retrieveTopSessions\`,`,
    `  PRF 포함) 그대로 재사용.`,
    `- **R@5 (hit)**: 정답 세션 중 최소 1개가 top-5 안에 있으면 1, 아니면 0`,
    `  (질문 단위 이진 hit — LongMemEval.ts 의 macro fractional recall 과`,
    `  다른 지표이니 직접 비교하지 말 것).`,
    `- **MRR**: 첫 정답 세션의 역순위 (top-10 밖이면 0).`,
    `- **top-5 평균 토큰**: top-5 세션 텍스트의 \`estimateTokens\` 추정 합의 평균.`,
    ``,
    `## 체크포인트 × 조건`,
    ``,
    header,
    sep,
    ...result.aggregates.map(row),
    ``,
    `## 평가/스킵 카운트`,
    ``,
    `| checkpoint | evaluated | skipped |`,
    `|---|---|---|`,
    ...result.checkpoints.map(
      (f) => `| ${(f * 100).toFixed(0)}% | ${result.evaluatedByCheckpoint[f] ?? 0} | ${result.skippedByCheckpoint[f] ?? 0} |`,
    ),
    ``,
    ...(result.mode === "cohort" ? [`> cohort 제외 문항 수(체크포인트 전체 기준, 위 skipped 에 포함됨): ${result.cohortExcluded ?? 0}`, ``] : []),
    `## Question type 별 (knowledge-update 포함)`,
    ``,
  ];

  const types = Array.from(new Set(result.byType.map((t) => t.questionType))).sort();
  for (const t of types) {
    lines.push(`### ${t}`, ``, header, sep);
    for (const cell of result.byType.filter((c) => c.questionType === t)) lines.push(row(cell));
    lines.push(``);
  }

  lines.push(
    `## 한계 (threats to validity)`,
    ``,
    `1. **세션 축적 강건성 측정이며 달력 경과 실측이 아니다** — 체크포인트는`,
    `   haystack 세션 수 비율(f)이며, 실제 날짜 경과(일/주/개월)를 통제한`,
    `   측정이 아니다. 세션 수 증가와 검색 품질 변화의 상관을 보는 것이지,`,
    `   달력상 시간 경과에 따른 부패를 직접 증명하지 않는다.`,
    `2. **naive 조건 정의의 한계** — "append-only 덤프"의 근사치로 lexical+`,
    `   vector hybrid(rescue) 를 사용했다 (strawman 방지 목적). 실제`,
    `   append-only 시스템(순수 벡터 유사도, 순수 키워드 등)은 이보다`,
    `   나쁘거나 다를 수 있다.`,
    `3. **단일 실행** — 검색은 결정론적(FTS5 + 해시 n-gram 벡터 + 고정`,
    `   tie-break)이라 반복 실행 분산은 0이나, 데이터셋 자체의 표본 편향은`,
    `   통제하지 않는다.`,
    `4. **정직성 원칙** — 본 벤치는 결과가 어느 방향이든 있는 그대로 보고`,
    `   하며, 유리한 방향의 튜닝 상수를 도입하지 않았다.`,
    ``,
    `## 재현`,
    ``,
    "```bash",
    `cfgm rot-bench                     # 전체 500 문항`,
    `cfgm rot-bench -- --sample 50       # smoke run`,
    `cfgm rot-bench -- --seed-order      # 날짜 재정렬 대신 데이터셋 원 순서 사용`,
    `cfgm rot-bench -- --json            # 구조화 결과 전체`,
    `cfgm rot-bench -- --cohort          # 코호트 모드 (동일 문항 집단, rot-bench-cohort-latest.md)`,
    "```",
  );
  return lines.join("\n");
}
