import { describe, test, expect } from "bun:test";
import { BenchRunner, parseBenchCases } from "../../../src/core/bench/BenchRunner";
import { renderBenchReport } from "../../../src/core/bench/report";
import { SearchIndex } from "../../../src/core/search/SearchIndex";
import { HashedNgramEmbedder } from "../../../src/core/search/Embedder";
import type { WikiPage } from "../../../src/core/wiki/types";
import type { BenchReport } from "../../../src/core/bench/types";

function page(id: string, type: "concept" | "decision" | "project", body: string): WikiPage {
  return {
    path: `${type}s/${id.split(".")[1]}.md`,
    frontmatter: { id, type, status: "active", updated_at: "2026-07-21" },
    body,
    claimIds: [],
    evidence: [],
  };
}

const CORPUS: WikiPage[] = [
  page("concept.routing", "concept", "Request classification selects a memory lane. Canonical page limit three."),
  page("decision.oss", "decision", "Honcho persona pattern incorporated. OpenClaw wiki format decision."),
  page("project.brain", "project", "Production grade memory engine project status."),
];

const runner = new BenchRunner();
const embedder = new HashedNgramEmbedder();

describe("BenchRunner — router bench (V3.28)", () => {
  test("전량 적중 케이스 → hitRate 1.0", () => {
    const r = runner.runRouterBench([
      { id: "a", query: "ADR-12 근거", expectLanes: ["decision"] },
      { id: "b", query: "bun:sqlite 정책", expectLanes: ["code"] },
    ]);
    expect(r.hitRate).toBe(1);
    expect(r.macroLaneRecall).toBe(1);
    expect(r.caseCount).toBe(2);
  });

  test("miss 케이스 — 기대 lane 미포함이면 laneHit false, 수치 반영", () => {
    const r = runner.runRouterBench([
      { id: "miss", query: "완전히 무관한 잡담 문장", expectLanes: ["decision"] },
      { id: "hit", query: "ADR-3 보여줘", expectLanes: ["decision"] },
    ]);
    expect(r.hitRate).toBe(0.5);
    expect(r.cases.find((c) => c.id === "miss")!.laneHit).toBe(false);
    expect(r.cases.find((c) => c.id === "miss")!.laneRecall).toBe(0);
  });

  test("expectFiles — files ⊆ 검사, fileHitRate 는 지정 케이스 한정", () => {
    const r = runner.runRouterBench([
      { id: "f1", query: "PR-V3.28 상태", expectLanes: ["current"], expectFiles: ["memory/current.md"] },
      { id: "f2", query: "ADR-1", expectLanes: ["decision"] },
    ]);
    expect(r.fileHitRate).toBe(1);
    expect(r.cases.find((c) => c.id === "f2")!.fileHit).toBeUndefined();
  });

  test("부분 적중 — precision/recall 이 0~1 사이", () => {
    const r = runner.runRouterBench([
      // "claim" 은 decision+concept 반환 — decision 만 기대하면 recall 1, precision 0.5
      { id: "p", query: "claim 규칙", expectLanes: ["decision"] },
    ]);
    const c = r.cases[0]!;
    expect(c.laneRecall).toBe(1);
    expect(c.lanePrecision).toBeCloseTo(0.5);
    expect(c.laneHit).toBe(true);
  });

  test("빈 케이스 배열 → 0 division 안전", () => {
    const r = runner.runRouterBench([]);
    expect(r.hitRate).toBe(0);
    expect(r.fileHitRate).toBeNull();
  });
});

describe("BenchRunner — search bench (V3.28)", () => {
  function buildIndex(): SearchIndex {
    const idx = new SearchIndex(":memory:");
    idx.rebuild({ wikiPages: CORPUS, claims: [], embedder });
    return idx;
  }

  test("fts / hybrid 두 모드 결과 반환 + 정답 케이스 recall 1", () => {
    const idx = buildIndex();
    const r = runner.runWikiSearchBench(
      [{ id: "s1", query: "request classification lane", relevant: ["concept.routing"] }],
      idx,
      embedder,
    );
    idx.close();
    expect(r.modes.map((m) => m.mode)).toEqual(["fts", "hybrid"]);
    for (const m of r.modes) {
      expect(m.recallAt5).toBe(1);
      expect(m.mrr).toBeGreaterThan(0);
    }
  });

  test("오타 쿼리 — hybrid recall ≥ fts recall", () => {
    const idx = buildIndex();
    const r = runner.runWikiSearchBench(
      [{ id: "typo", query: "honco personna incorporeted", relevant: ["decision.oss"] }],
      idx,
      embedder,
    );
    idx.close();
    const fts = r.modes.find((m) => m.mode === "fts")!;
    const hybrid = r.modes.find((m) => m.mode === "hybrid")!;
    expect(hybrid.recallAt5).toBeGreaterThanOrEqual(fts.recallAt5);
    expect(hybrid.recallAt5).toBe(1); // n-gram 벡터가 구제해야 하는 케이스
  });

  test("skill search bench — fts/hybrid 두 모드", () => {
    const idx = new SearchIndex(":memory:");
    const skill = {
      sslVersion: "0.3.1",
      sourceSkillPath: ".claude/skills/reaper/SKILL.md",
      sourceSha256: "0".repeat(64),
      generatedAt: "2026-07-21T00:00:00.000Z",
      generatedBy: "heuristic",
      warnings: [],
      scheduling: {
        id: "reaper#scheduling",
        skillName: "reaper",
        intentSignature: "Recover stale pending jobs",
        triggerPatterns: [],
        preconditions: [],
        ioContract: { inputsRaw: "", outputsRaw: "" },
      },
      structural: [],
      logical: [],
    };
    idx.rebuild({ wikiPages: [], claims: [], skills: [skill as never], embedder });
    const r = runner.runSkillSearchBench(
      [{ id: "k", query: "stale job recovery", relevant: ["reaper"] }],
      idx,
      embedder,
    );
    idx.close();
    expect(r.target).toBe("skill");
    for (const m of r.modes) expect(m.recallAt5).toBe(1);
  });

  test("미적중 케이스 — firstRelevantRank null, MRR 0 기여", () => {
    const idx = buildIndex();
    const r = runner.runWikiSearchBench(
      [{ id: "none", query: "banana smoothie", relevant: ["concept.routing"] }],
      idx,
      embedder,
    );
    idx.close();
    const fts = r.modes.find((m) => m.mode === "fts")!;
    expect(fts.cases[0]!.firstRelevantRank).toBeNull();
    expect(fts.mrr).toBe(0);
  });
});

describe("parseBenchCases / renderBenchReport", () => {
  test("parse — 유효 형태 통과, 누락 필드 reject", () => {
    const ok = parseBenchCases({
      router: [{ id: "a", query: "q", expectLanes: ["decision"] }],
      wikiSearch: [{ id: "b", query: "q", relevant: ["x"] }],
    });
    expect(ok.router.length).toBe(1);
    expect(ok.skillSearch).toEqual([]);
    expect(() => parseBenchCases(null)).toThrow();
    expect(() => parseBenchCases({ router: [{ id: "a" }] })).toThrow();
    expect(() => parseBenchCases({ wikiSearch: [{ id: "a", query: "q", relevant: [] }] })).toThrow();
    expect(() => parseBenchCases({ router: "not-array" })).toThrow();
  });

  test("report — 핵심 수치와 miss 목록 포함", () => {
    const idx = new SearchIndex(":memory:");
    idx.rebuild({ wikiPages: CORPUS, claims: [], embedder });
    const report: BenchReport = {
      generatedAt: "2026-07-21T12:00:00.000Z",
      corpus: { wikiPages: CORPUS.length, skills: 0, vectorDims: embedder.dims },
      router: runner.runRouterBench([
        { id: "hit", query: "ADR-9", expectLanes: ["decision"] },
        { id: "miss", query: "무관한 문장", expectLanes: ["persona"] },
      ]),
      wiki: runner.runWikiSearchBench(
        [{ id: "s", query: "classification lane", relevant: ["concept.routing"] }],
        idx,
        embedder,
      ),
      skills: null,
    };
    idx.close();
    const md = renderBenchReport(report);
    expect(md).toContain("# Memory Quality Benchmark");
    expect(md).toContain("lane hit rate");
    expect(md).toContain("50.0%");
    expect(md).toContain("Miss 케이스");
    expect(md).toContain("`miss`");
    expect(md).toContain("recall@5");
    expect(md).toContain("hybrid 효과");
  });
});
