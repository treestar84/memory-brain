import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { SearchIndex } from "../../../src/core/search/SearchIndex";
import type { WikiPage } from "../../../src/core/wiki/types";
import type { ClaimCandidate } from "../../../src/core/claim/types";

function makeWikiPage(overrides: Partial<WikiPage> = {}): WikiPage {
  return {
    path: "decisions/test.md",
    frontmatter: {
      id: "decision.test",
      type: "decision",
      status: "active",
      updated_at: "2026-04-28",
      tags: ["alpha", "beta"],
    },
    body: "테스트 페이지 본문 — sample decision content",
    claimIds: [],
    evidence: [],
    ...overrides,
  };
}

function makeClaim(overrides: Partial<ClaimCandidate> = {}): ClaimCandidate {
  return {
    candidateId: "cc-search-1",
    bundleId: "b1",
    blockId: "blk-1",
    proposedType: "outcome",
    proposedText: "search test outcome content",
    detectedBy: "rule-x",
    confidence: 0.9,
    evidence: [],
    status: "pending",
    createdAt: "2026-04-28T00:00:00Z",
    decidedAt: null,
    decidedBy: null,
    reason: null,
    ...overrides,
  };
}

describe("SearchIndex", () => {
  let idx: SearchIndex;

  beforeEach(() => {
    idx = new SearchIndex(":memory:");
  });

  afterEach(() => {
    idx.close();
  });

  test("초기 — schema_version 메타 2 (PR-V3.14 ssl_skills 추가)", () => {
    expect(idx.getMeta("schema_version")).toBe("2");
    expect(idx.getMeta("rebuilt_at")).toBeNull();
  });

  test("rebuild + searchWiki — 단어 매치 1건", () => {
    idx.rebuild({
      wikiPages: [makeWikiPage({ body: "decision about routing policy" })],
      claims: [],
    });
    const hits = idx.searchWiki("routing");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.pageId).toBe("decision.test");
    expect(hits[0]!.snippet).toContain("routing");
  });

  test("searchWiki — 매치 없음 → 빈 배열", () => {
    idx.rebuild({
      wikiPages: [makeWikiPage({ body: "alpha beta gamma" })],
      claims: [],
    });
    expect(idx.searchWiki("nonexistent")).toHaveLength(0);
  });

  test("searchWiki — type 필터", () => {
    idx.rebuild({
      wikiPages: [
        makeWikiPage({
          path: "decisions/a.md",
          frontmatter: { id: "decision.a", type: "decision", status: "active", updated_at: "2026-04-28" },
          body: "common keyword",
        }),
        makeWikiPage({
          path: "concepts/b.md",
          frontmatter: { id: "concept.b", type: "concept", status: "active", updated_at: "2026-04-28" },
          body: "common keyword",
        }),
      ],
      claims: [],
    });
    const decisions = idx.searchWiki("common", { type: "decision" });
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.type).toBe("decision");

    const concepts = idx.searchWiki("common", { type: "concept" });
    expect(concepts).toHaveLength(1);
    expect(concepts[0]!.type).toBe("concept");
  });

  test("searchWiki — status 필터", () => {
    idx.rebuild({
      wikiPages: [
        makeWikiPage({
          path: "p/a.md",
          frontmatter: { id: "x.a", type: "project", status: "active", updated_at: "2026-04-28" },
          body: "shared",
        }),
        makeWikiPage({
          path: "p/b.md",
          frontmatter: { id: "x.b", type: "project", status: "draft", updated_at: "2026-04-28" },
          body: "shared",
        }),
      ],
      claims: [],
    });
    expect(idx.searchWiki("shared", { status: "active" })).toHaveLength(1);
    expect(idx.searchWiki("shared", { status: "draft" })).toHaveLength(1);
  });

  test("rebuild — 두 번째 rebuild 시 이전 데이터 비움", () => {
    idx.rebuild({ wikiPages: [makeWikiPage({ body: "first" })], claims: [] });
    expect(idx.searchWiki("first")).toHaveLength(1);

    idx.rebuild({
      wikiPages: [makeWikiPage({ body: "second different content" })],
      claims: [],
    });
    expect(idx.searchWiki("first")).toHaveLength(0);
    expect(idx.searchWiki("second")).toHaveLength(1);
  });

  test("searchClaims — text 매치 + status 필터", () => {
    idx.rebuild({
      wikiPages: [],
      claims: [
        makeClaim({ candidateId: "c1", proposedText: "outcome about deployment", status: "pending" }),
        makeClaim({ candidateId: "c2", proposedText: "outcome about deployment", status: "accepted" }),
      ],
    });
    expect(idx.searchClaims("deployment")).toHaveLength(2);
    expect(idx.searchClaims("deployment", { status: "accepted" })).toHaveLength(1);
  });

  test("rebuild 후 meta — wiki/claim count 기록", () => {
    idx.rebuild({
      wikiPages: [makeWikiPage(), makeWikiPage({ frontmatter: { ...makeWikiPage().frontmatter, id: "decision.b" } })],
      claims: [makeClaim()],
    });
    expect(idx.getMeta("wiki_count")).toBe("2");
    expect(idx.getMeta("claim_count")).toBe("1");
    expect(idx.getMeta("rebuilt_at")).not.toBeNull();
  });

  test("limit 옵션 — 결과 수 제한", () => {
    const pages = Array.from({ length: 10 }, (_, i) =>
      makeWikiPage({
        path: `p/${i}.md`,
        frontmatter: {
          id: `decision.x${i}`,
          type: "decision",
          status: "active",
          updated_at: "2026-04-28",
        },
        body: "shared keyword sample",
      }),
    );
    idx.rebuild({ wikiPages: pages, claims: [] });
    const hits = idx.searchWiki("shared", { limit: 3 });
    expect(hits).toHaveLength(3);
  });
});
