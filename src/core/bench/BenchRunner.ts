import { RouterMappings } from "../router/RouterMappings";
import type { SearchIndex } from "../search/SearchIndex";
import type { Embedder } from "../search/Embedder";
import type {
  BenchCases,
  RouterBenchCase,
  RouterBenchResult,
  RouterCaseResult,
  SearchBenchCase,
  SearchBenchResult,
  SearchCaseResult,
  SearchMode,
  SearchModeResult,
} from "./types";

const SEARCH_DEPTH = 10;

/**
 * Memory quality benchmark 실행기 (V3.28).
 *
 * - **router bench**: RouterMappings.resolve 가 fixture 쿼리에서 기대 lane/file
 *   을 얼마나 적중하는지 (hit rate + macro precision/recall).
 * - **search bench**: 같은 fixture 를 fts / hybrid 두 모드로 돌려 recall@k,
 *   MRR 을 비교 — hybrid 도입 효과를 수치로 입증/반증한다.
 *
 * 결정론: 입력 (cases + corpus + embedder) 이 같으면 결과가 같다.
 */
export class BenchRunner {
  runRouterBench(
    cases: RouterBenchCase[],
    mappings: RouterMappings = new RouterMappings(),
  ): RouterBenchResult {
    const results: RouterCaseResult[] = cases.map((c) => {
      const res = mappings.resolve(c.query);
      const actual = new Set(res.lanes);
      const expected = new Set(c.expectLanes);
      const inter = c.expectLanes.filter((l) => actual.has(l)).length;
      const laneHit = inter === expected.size;
      const lanePrecision = actual.size === 0 ? (expected.size === 0 ? 1 : 0) : inter / actual.size;
      const laneRecall = expected.size === 0 ? 1 : inter / expected.size;

      let fileHit: boolean | undefined;
      if (c.expectFiles && c.expectFiles.length > 0) {
        const files = new Set(res.files);
        fileHit = c.expectFiles.every((f) => files.has(f));
      }
      return {
        id: c.id,
        query: c.query,
        expectLanes: c.expectLanes,
        actualLanes: res.lanes,
        laneHit,
        lanePrecision,
        laneRecall,
        fileHit,
      };
    });

    const n = results.length;
    const fileCases = results.filter((r) => r.fileHit !== undefined);
    return {
      caseCount: n,
      hitRate: n === 0 ? 0 : results.filter((r) => r.laneHit).length / n,
      macroLanePrecision: n === 0 ? 0 : results.reduce((s, r) => s + r.lanePrecision, 0) / n,
      macroLaneRecall: n === 0 ? 0 : results.reduce((s, r) => s + r.laneRecall, 0) / n,
      fileHitRate:
        fileCases.length === 0
          ? null
          : fileCases.filter((r) => r.fileHit).length / fileCases.length,
      cases: results,
    };
  }

  runWikiSearchBench(
    cases: SearchBenchCase[],
    index: SearchIndex,
    embedder: Embedder,
  ): SearchBenchResult {
    return {
      target: "wiki",
      modes: [
        this.evalMode("fts", cases, (q) => index.searchWiki(q, { limit: SEARCH_DEPTH }).map((h) => h.pageId)),
        this.evalMode("hybrid", cases, (q) =>
          index.searchWikiHybrid(q, embedder, { limit: SEARCH_DEPTH }).map((h) => h.pageId),
        ),
      ],
    };
  }

  runSkillSearchBench(
    cases: SearchBenchCase[],
    index: SearchIndex,
    embedder: Embedder,
  ): SearchBenchResult {
    return {
      target: "skill",
      modes: [
        this.evalMode("fts", cases, (q) => index.searchSkills(q, { limit: SEARCH_DEPTH }).map((h) => h.skillSlug)),
        this.evalMode("hybrid", cases, (q) =>
          index.searchSkillsHybrid(q, embedder, { limit: SEARCH_DEPTH }).map((h) => h.skillSlug),
        ),
      ],
    };
  }

  private evalMode(
    mode: SearchMode,
    cases: SearchBenchCase[],
    rank: (query: string) => string[],
  ): SearchModeResult {
    const perCase: SearchCaseResult[] = [];
    let r1 = 0;
    let r3 = 0;
    let r5 = 0;
    let mrrSum = 0;

    for (const c of cases) {
      const ranked = rank(c.query);
      const relevant = new Set(c.relevant);
      const firstIdx = ranked.findIndex((id) => relevant.has(id));
      const firstRelevantRank = firstIdx >= 0 ? firstIdx + 1 : null;
      if (firstRelevantRank !== null) mrrSum += 1 / firstRelevantRank;

      r1 += recallAtK(ranked, relevant, 1);
      r3 += recallAtK(ranked, relevant, 3);
      r5 += recallAtK(ranked, relevant, 5);
      perCase.push({ id: c.id, query: c.query, firstRelevantRank });
    }

    const n = cases.length;
    return {
      mode,
      caseCount: n,
      recallAt1: n === 0 ? 0 : r1 / n,
      recallAt3: n === 0 ? 0 : r3 / n,
      recallAt5: n === 0 ? 0 : r5 / n,
      mrr: n === 0 ? 0 : mrrSum / n,
      cases: perCase,
    };
  }
}

// 표준 recall@k = |relevant ∩ top-k| / |relevant|
function recallAtK(ranked: string[], relevant: ReadonlySet<string>, k: number): number {
  if (relevant.size === 0) return 1;
  const found = ranked.slice(0, k).filter((id) => relevant.has(id)).length;
  return found / relevant.size;
}

/** cases.json 로더 — 형태 검증 포함. */
export function parseBenchCases(raw: unknown): BenchCases {
  if (!raw || typeof raw !== "object") throw new Error("bench cases: root must be an object");
  const obj = raw as Record<string, unknown>;
  const router = asArray(obj.router, "router").map((c, i) => {
    const r = c as Record<string, unknown>;
    requireString(r.id, `router[${i}].id`);
    requireString(r.query, `router[${i}].query`);
    if (!Array.isArray(r.expectLanes) || r.expectLanes.length === 0) {
      throw new Error(`router[${i}].expectLanes must be a non-empty array`);
    }
    return r as unknown as RouterBenchCase;
  });
  const searchOf = (key: "wikiSearch" | "skillSearch"): SearchBenchCase[] =>
    asArray(obj[key], key).map((c, i) => {
      const r = c as Record<string, unknown>;
      requireString(r.id, `${key}[${i}].id`);
      requireString(r.query, `${key}[${i}].query`);
      if (!Array.isArray(r.relevant) || r.relevant.length === 0) {
        throw new Error(`${key}[${i}].relevant must be a non-empty array`);
      }
      return r as unknown as SearchBenchCase;
    });
  return { router, wikiSearch: searchOf("wikiSearch"), skillSearch: searchOf("skillSearch") };
}

function asArray(v: unknown, name: string): unknown[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw new Error(`bench cases: ${name} must be an array`);
  return v;
}

function requireString(v: unknown, name: string): void {
  if (typeof v !== "string" || v.length === 0) throw new Error(`bench cases: ${name} must be a non-empty string`);
}
