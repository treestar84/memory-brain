import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsStorage } from "../../../src/core/storage/FsStorage";
import { FakeClock } from "../../../src/core/clock/Clock";
import { FlowGraphStore } from "../../../src/core/flow/FlowGraphStore";
import { ContentHasher } from "../../../src/core/dedup/ContentHasher";
import { DedupIndex } from "../../../src/core/dedup/DedupIndex";
import type { FlowBlock } from "../../../src/core/flow/types";

function makeBlock(overrides: Partial<FlowBlock> = {}): FlowBlock {
  return {
    blockId: "b1",
    problemId: "p1",
    type: "Cause",
    status: "confirmed",
    label: "test block",
    confidence: 0.7,
    supportedBy: [],
    relations: [],
    createdAt: "2026-04-25T00:00:00Z",
    lastConfirmedAt: null,
    staleAfter: null,
    supersededBy: null,
    bundleId: "bnd1",
    ...overrides,
  };
}

describe("DedupIndex", () => {
  let root: string;
  let storage: FsStorage;
  let clock: FakeClock;
  let store: FlowGraphStore;
  let hasher: ContentHasher;
  let dedup: DedupIndex;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "dedup-"));
    storage = new FsStorage(root);
    clock = new FakeClock();
    store = new FlowGraphStore(storage, clock);
    hasher = new ContentHasher();
    dedup = new DedupIndex(store, storage, clock, hasher);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("빈 ledger → has=false", async () => {
    expect(await dedup.has("p1", "Cause", "foo")).toBe(false);
  });

  test("같은 type+label block-add 후 → has=true", async () => {
    await store.appendDelta("p1", {
      op: "block-add",
      timestampIso: "2026-04-25T00:00:00Z",
      block: makeBlock({ blockId: "b1", label: "alpha" }),
    });
    expect(await dedup.has("p1", "Cause", "alpha")).toBe(true);
  });

  test("같은 label, 다른 type → has=false", async () => {
    await store.appendDelta("p1", {
      op: "block-add",
      timestampIso: "2026-04-25T00:00:00Z",
      block: makeBlock({ blockId: "b1", type: "Cause", label: "alpha" }),
    });
    expect(await dedup.has("p1", "Gap", "alpha")).toBe(false);
  });

  test("block-supersede 후 동일 type+label → has=false (supersede Set 적용)", async () => {
    await store.appendDelta("p1", {
      op: "block-add",
      timestampIso: "2026-04-25T00:00:00Z",
      block: makeBlock({ blockId: "b1", label: "alpha" }),
    });
    await store.appendDelta("p1", {
      op: "block-supersede",
      timestampIso: "2026-04-25T00:01:00Z",
      problemId: "p1",
      blockId: "b1",
      supersededBy: "decay",
      reason: "decay",
    });
    expect(await dedup.has("p1", "Cause", "alpha")).toBe(false);
  });

  test("다른 problemId → has=false (problem-scoped)", async () => {
    await store.appendDelta("p1", {
      op: "block-add",
      timestampIso: "2026-04-25T00:00:00Z",
      block: makeBlock({ blockId: "b1", problemId: "p1", label: "alpha" }),
    });
    expect(await dedup.has("p2", "Cause", "alpha")).toBe(false);
  });

  test("logSkip은 best-effort: 정상 경로에서 audit log 1건 기록", async () => {
    await dedup.logSkip({
      problemId: "p1",
      hash: hasher.hash("Cause", "alpha"),
      attemptedBlockId: "b2",
      type: "Cause",
      reason: "duplicate-type-label",
    });
    const entries = await storage.readJsonl<Record<string, unknown>>("security/dedup-skip.jsonl");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      problemId: "p1",
      attemptedBlockId: "b2",
      type: "Cause",
      reason: "duplicate-type-label",
    });
    expect(typeof entries[0]!.at).toBe("string");
  });
});
