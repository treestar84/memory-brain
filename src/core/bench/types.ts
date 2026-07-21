import type { MemoryLane } from "../router/types";

/**
 * Memory quality benchmark 도메인 타입 (V3.28).
 *
 * 코드 정확성 (bun test) 과 별개로 **메모리 품질** — 라우팅 적중률, 검색
 * recall — 을 정량 측정한다. 2026년 기준 agent memory 분야는 벤치마크로
 * 겨루는 측정 가능한 엔지니어링 분야가 됐고 (LoCoMo 등), memory-brain 도
 * 주장 대신 수치를 제시한다.
 *
 * fixture (fixtures/bench/cases.json) 가 기대값의 source-of-truth. 실제
 * memory/ 코퍼스 대상으로 측정하므로 페이지 개편 시 fixture 도 함께 갱신.
 */

export interface RouterBenchCase {
  id: string;
  query: string;
  /** resolve 결과에 모두 포함되어야 하는 lane */
  expectLanes: MemoryLane[];
  /** resolve 결과 files 에 모두 포함되어야 하는 경로 (선택) */
  expectFiles?: string[];
}

export interface SearchBenchCase {
  id: string;
  query: string;
  /** 정답 문서 id (wiki: page id, skill: slug). 1개 이상. */
  relevant: string[];
}

export interface BenchCases {
  router: RouterBenchCase[];
  wikiSearch: SearchBenchCase[];
  skillSearch: SearchBenchCase[];
}

export interface RouterCaseResult {
  id: string;
  query: string;
  expectLanes: MemoryLane[];
  actualLanes: MemoryLane[];
  /** expectLanes ⊆ actualLanes */
  laneHit: boolean;
  lanePrecision: number;
  laneRecall: number;
  /** expectFiles 지정 시: expectFiles ⊆ actual files */
  fileHit?: boolean;
}

export interface RouterBenchResult {
  caseCount: number;
  /** laneHit 비율 */
  hitRate: number;
  macroLanePrecision: number;
  macroLaneRecall: number;
  /** expectFiles 있는 케이스 한정 fileHit 비율 (없으면 null) */
  fileHitRate: number | null;
  cases: RouterCaseResult[];
}

export type SearchMode = "fts" | "hybrid";

export interface SearchCaseResult {
  id: string;
  query: string;
  /** 첫 정답 문서의 1-based rank. top-10 안에 없으면 null. */
  firstRelevantRank: number | null;
}

export interface SearchModeResult {
  mode: SearchMode;
  caseCount: number;
  /** macro recall@k — case 별 |relevant ∩ top-k| / |relevant| 평균 */
  recallAt1: number;
  recallAt3: number;
  recallAt5: number;
  /** mean reciprocal rank (첫 정답 기준, top-10 밖 = 0) */
  mrr: number;
  cases: SearchCaseResult[];
}

export interface SearchBenchResult {
  target: "wiki" | "skill";
  modes: SearchModeResult[];
}

export interface BenchReport {
  generatedAt: string;
  corpus: { wikiPages: number; skills: number; vectorDims: number };
  router: RouterBenchResult | null;
  wiki: SearchBenchResult | null;
  skills: SearchBenchResult | null;
}
