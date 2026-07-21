import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { SearchIndex } from "../../../src/core/search/SearchIndex";
import { HashedNgramEmbedder } from "../../../src/core/search/Embedder";
import type { WikiPage } from "../../../src/core/wiki/types";
import type { SSLDocument } from "../../../src/core/ontology/ssl";

function page(id: string, type: "concept" | "decision" | "project", body: string, tags: string[] = []): WikiPage {
  return {
    path: `${type}s/${id.split(".")[1]}.md`,
    frontmatter: { id, type, status: "active", updated_at: "2026-07-21", tags },
    body,
    claimIds: [],
    evidence: [],
  };
}

const PAGES: WikiPage[] = [
  page("concept.memory-routing", "concept", "Request classification selects a memory lane. Router policy limits canonical pages per query.", ["router"]),
  page("decision.oss-incorporation", "decision", "Honcho persona layer decision. OpenClaw wiki format incorporated for canonical knowledge.", ["oss"]),
  page("concept.ssl-representation", "concept", "SSL scheduling structural logical representation of skills as typed knowledge graphs.", ["ssl"]),
  page("project.memory-brain", "project", "CFGM-OS production-grade memory engine project. Claim grounded, persona aware.", ["project"]),
];

function skillDoc(slug: string, name: string, intent: string): SSLDocument {
  return {
    sslVersion: "0.3.1",
    sourceSkillPath: `.claude/skills/${slug}/SKILL.md`,
    sourceSha256: "0".repeat(64),
    generatedAt: "2026-07-21T00:00:00.000Z",
    generatedBy: "heuristic",
    warnings: [],
    scheduling: {
      id: `${slug}#scheduling`,
      skillName: name,
      intentSignature: intent,
      triggerPatterns: [],
      preconditions: [],
      ioContract: { inputsRaw: "", outputsRaw: "" },
    },
    structural: [],
    logical: [],
  } as unknown as SSLDocument;
}

const SKILLS: SSLDocument[] = [
  skillDoc("screenshot-builder", "screenshot-builder", "Generate app store screenshots"),
  skillDoc("queue-reaper", "queue-reaper", "Recover stale pending normalize jobs"),
];

describe("SearchIndex hybrid (V3.28, schema v4)", () => {
  let index: SearchIndex;
  const embedder = new HashedNgramEmbedder();

  beforeEach(() => {
    index = new SearchIndex(":memory:");
  });

  afterEach(() => {
    index.close();
  });

  test("embedder 없는 rebuild → vectors 비어 있고 hybrid 는 FTS fallback", () => {
    index.rebuild({ wikiPages: PAGES, claims: [] });
    expect(index.vectorCount()).toBe(0);
    const fts = index.searchWiki("router policy");
    const hybrid = index.searchWikiHybrid("router policy", embedder);
    expect(hybrid.map((h) => h.pageId)).toEqual(fts.map((h) => h.pageId));
  });

  test("embedder rebuild → wiki + skill 벡터 저장", () => {
    index.rebuild({ wikiPages: PAGES, claims: [], skills: SKILLS, embedder });
    expect(index.vectorCount("wiki")).toBe(PAGES.length);
    expect(index.vectorCount("skill")).toBe(SKILLS.length);
    expect(index.getMeta("vector_dims")).toBe(String(embedder.dims));
  });

  test("hybrid wiki — FTS 매칭 쿼리에서 정답 유지", () => {
    index.rebuild({ wikiPages: PAGES, claims: [], embedder });
    const hits = index.searchWikiHybrid("router lane policy", embedder, { limit: 3 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.pageId).toBe("concept.memory-routing");
  });

  test("hybrid wiki — FTS 0건인 오타/변형 쿼리를 벡터가 구제", () => {
    index.rebuild({ wikiPages: PAGES, claims: [], embedder });
    // 'incorporati' 는 prefix* 로 매칭돼도 'incorporeted' 오타는 FTS 0건 가능
    const typo = "openclow incorporeted";
    const fts = index.searchWiki(typo);
    const hybrid = index.searchWikiHybrid(typo, embedder, { limit: 2 });
    expect(hybrid.length).toBeGreaterThanOrEqual(fts.length);
    expect(hybrid.map((h) => h.pageId)).toContain("decision.oss-incorporation");
  });

  test("hybrid wiki — type/status 필터가 벡터-only 결과에도 적용", () => {
    index.rebuild({ wikiPages: PAGES, claims: [], embedder });
    const hits = index.searchWikiHybrid("memory engine project claim", embedder, { type: "project" });
    for (const h of hits) expect(h.type).toBe("project");
  });

  test("hybrid wiki — rank 는 낮을수록 관련성↑ 규약 유지 (음수 RRF)", () => {
    index.rebuild({ wikiPages: PAGES, claims: [], embedder });
    const hits = index.searchWikiHybrid("ssl typed knowledge graph", embedder, { limit: 4 });
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i]!.rank).toBeGreaterThanOrEqual(hits[i - 1]!.rank);
    }
    expect(hits[0]!.rank).toBeLessThan(0);
  });

  test("hybrid skills — 정답 스킬 우선 + 벡터 구제", () => {
    index.rebuild({ wikiPages: [], claims: [], skills: SKILLS, embedder });
    const hits = index.searchSkillsHybrid("stale job recovery", embedder, { limit: 2 });
    expect(hits.map((h) => h.skillSlug)).toContain("queue-reaper");
  });

  test("hybrid skills — 벡터 없으면 FTS fallback", () => {
    index.rebuild({ wikiPages: [], claims: [], skills: SKILLS });
    const fts = index.searchSkills("screenshots");
    const hybrid = index.searchSkillsHybrid("screenshots", embedder);
    expect(hybrid.map((h) => h.skillSlug)).toEqual(fts.map((h) => h.skillSlug));
  });

  test("dims 불일치 벡터는 무시 (다른 embedder 방어)", () => {
    index.rebuild({ wikiPages: PAGES, claims: [], embedder: new HashedNgramEmbedder({ dims: 64 }) });
    const hits = index.searchWikiHybrid("router policy", embedder); // 256 dims 쿼리
    const fts = index.searchWiki("router policy");
    expect(hits.map((h) => h.pageId)).toEqual(fts.map((h) => h.pageId));
  });

  test("FTS 구문 문자 방어 — 하이픈/콜론 쿼리가 크래시 없이 동작 (V3.28)", () => {
    index.rebuild({ wikiPages: PAGES, claims: [], embedder });
    // "KG-Brain" 류 하이픈은 raw FTS5 MATCH 에서 SQLiteError — sanitize 폴백 검증
    expect(() => index.searchWiki("KG-Brain schema 채택")).not.toThrow();
    expect(() => index.searchWiki('bun:sqlite "unclosed')).not.toThrow();
    const hits = index.searchWiki("claim-grounded persona");
    expect(hits.map((h) => h.pageId)).toContain("project.memory-brain");
    expect(() => index.searchClaims("some-hyphenated: query")).not.toThrow();
  });

  test("결정론 — 같은 쿼리 두 번 → 같은 순서", () => {
    index.rebuild({ wikiPages: PAGES, claims: [], embedder });
    const a = index.searchWikiHybrid("memory knowledge", embedder);
    const b = index.searchWikiHybrid("memory knowledge", embedder);
    expect(a.map((h) => h.pageId)).toEqual(b.map((h) => h.pageId));
  });
});
