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
