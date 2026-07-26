import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WikiReader } from "../../../src/core/wiki/WikiReader";
import { ClaimStore } from "../../../src/core/claim/ClaimStore";
import { SearchIndex } from "../../../src/core/search/SearchIndex";
import { Indexer } from "../../../src/core/search/Indexer";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";
import type { ClaimCandidate } from "../../../src/core/claim/types";

const SAMPLE_WIKI = `---
id: decision.test
type: decision
status: active
updated_at: 2026-04-28
tags: [search, test]
---

# Test Decision

## Summary

<!-- claim:cl-1 -->
search index 정합성 검증.

## Evidence

- src/core/search/SearchIndex.ts
`;

function makeClaim(overrides: Partial<ClaimCandidate> = {}): ClaimCandidate {
  return {
    candidateId: "cc-test-1",
    bundleId: "b1",
    blockId: "blk-1",
    proposedType: "outcome",
    proposedText: "indexer test outcome",
    detectedBy: "rule",
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

describe("Indexer", () => {
  let memoryDir: string;
  let wikiReader: WikiReader;
  let claimStore: ClaimStore;
  let searchIndex: SearchIndex;
  let indexer: Indexer;

  beforeEach(async () => {
    memoryDir = await mkdtemp(join(tmpdir(), "indexer-"));
    await mkdir(join(memoryDir, "decisions"), { recursive: true });
    await mkdir(join(memoryDir, "concepts"), { recursive: true });
    await mkdir(join(memoryDir, "projects"), { recursive: true });

    wikiReader = new WikiReader(memoryDir);
    claimStore = new ClaimStore(new MemoryStorage(), new FakeClock());
    searchIndex = new SearchIndex(":memory:");
    indexer = new Indexer(wikiReader, claimStore, searchIndex);
  });

  afterEach(async () => {
    searchIndex.close();
    await rm(memoryDir, { recursive: true, force: true });
  });

  test("rebuild — 빈 입력 → wiki 0 / claim 0", async () => {
    const r = await indexer.rebuild();
    expect(r.wikiCount).toBe(0);
    expect(r.claimCount).toBe(0);
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("rebuild — 1 wiki page + 2 claim → 인덱스 채움", async () => {
    await writeFile(join(memoryDir, "decisions", "test.md"), SAMPLE_WIKI);
    await claimStore.append(makeClaim({ candidateId: "c1", proposedText: "alpha pattern" }));
    await claimStore.append(makeClaim({ candidateId: "c2", proposedText: "beta pattern" }));

    const r = await indexer.rebuild();
    expect(r.wikiCount).toBe(1);
    expect(r.claimCount).toBe(2);

    expect(searchIndex.searchWiki("정합성")).toHaveLength(1);
    expect(searchIndex.searchClaims("alpha")).toHaveLength(1);
    expect(searchIndex.searchClaims("pattern")).toHaveLength(2);
  });

  test("rebuild — 3 디렉토리 모두 스캔", async () => {
    const mkPage = (id: string, body: string) =>
      `---\nid: ${id}\ntype: ${id.split(".")[0]}\nstatus: active\nupdated_at: 2026-04-28\n---\n\n${body}\n`;
    await writeFile(join(memoryDir, "decisions", "d.md"), mkPage("decision.d", "decision body"));
    await writeFile(join(memoryDir, "concepts", "c.md"), mkPage("concept.c", "concept body"));
    await writeFile(join(memoryDir, "projects", "p.md"), mkPage("project.p", "project body"));

    const r = await indexer.rebuild();
    expect(r.wikiCount).toBe(3);
  });

  test("rebuild — current.md + journal/ + reports/ 도 note 로 스캔되어 검색된다 (V3.41)", async () => {
    await writeFile(join(memoryDir, "current.md"), "# 현재 작업\n\nRotAdapter clearTimeout 누수 수정.\n");
    await mkdir(join(memoryDir, "journal"), { recursive: true });
    await writeFile(join(memoryDir, "journal", "2026-07-26.md"), "# Journal\n\nSessionConsolidator 폐기 — recall 파괴.\n");
    await mkdir(join(memoryDir, "reports"), { recursive: true });
    await writeFile(join(memoryDir, "reports", "rot-latest.md"), "# Rot Report\n\nR@5 93.2%.\n");

    const r = await indexer.rebuild();
    expect(r.wikiCount).toBe(3);

    const rotHits = searchIndex.searchWiki("clearTimeout");
    expect(rotHits).toHaveLength(1);
    expect(rotHits[0]!.pageId).toBe("note.current");
    expect(rotHits[0]!.type).toBe("note");

    expect(searchIndex.searchWiki("SessionConsolidator")).toHaveLength(1);
    expect(searchIndex.searchWiki("93.2")).toHaveLength(1);
  });

  test("rebuild — 여러 주제가 섞인 current.md 는 ## 헤딩 단위 chunk 로 쪼개져 랭킹이 정확해진다", async () => {
    await writeFile(
      join(memoryDir, "current.md"),
      [
        "# memory/current.md",
        "",
        "## V3.39 RotAdapter 버그",
        "",
        "setTimeout 이 clearTimeout 안 돼서 안 끝났다.",
        "",
        "## V3.37 SessionConsolidator 폐기",
        "",
        "recall 파괴로 기각했다.",
        "",
      ].join("\n"),
    );

    const r = await indexer.rebuild();
    expect(r.wikiCount).toBeGreaterThan(1); // 서문 + 헤딩 2개 = chunk 3개

    const consolidatorHits = searchIndex.searchWiki("SessionConsolidator");
    expect(consolidatorHits).toHaveLength(1);
    expect(consolidatorHits[0]!.snippet).toContain("recall");
    expect(consolidatorHits[0]!.snippet).not.toContain("clearTimeout");
  });

  test("rebuild — current.md 없으면 조용히 건너뛴다 (0건, 에러 없음)", async () => {
    const r = await indexer.rebuild();
    expect(r.wikiCount).toBe(0);
  });

  test("rebuild 두 번 — 이전 인덱스 정상 갱신 (idempotent)", async () => {
    await writeFile(
      join(memoryDir, "decisions", "v1.md"),
      `---\nid: decision.v1\ntype: decision\nstatus: active\nupdated_at: 2026-04-28\n---\nv1 content\n`,
    );
    await indexer.rebuild();
    expect(searchIndex.searchWiki("v1")).toHaveLength(1);

    await rm(join(memoryDir, "decisions", "v1.md"));
    await writeFile(
      join(memoryDir, "decisions", "v2.md"),
      `---\nid: decision.v2\ntype: decision\nstatus: active\nupdated_at: 2026-04-28\n---\nv2 content\n`,
    );
    await indexer.rebuild();
    expect(searchIndex.searchWiki("v1")).toHaveLength(0);
    expect(searchIndex.searchWiki("v2")).toHaveLength(1);
  });
});
