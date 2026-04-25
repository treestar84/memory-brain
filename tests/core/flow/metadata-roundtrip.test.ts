import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsStorage } from "../../../src/core/storage/FsStorage";
import { FakeClock } from "../../../src/core/clock/Clock";
import { FlowGraphStore } from "../../../src/core/flow/FlowGraphStore";
import { FlowGraphProjector } from "../../../src/core/flow/FlowGraphProjector";
import type { FlowBlock, FlowBlockMetadata } from "../../../src/core/flow/types";

function makeBlock(overrides: Partial<FlowBlock> = {}): FlowBlock {
  return {
    blockId: "b1",
    problemId: "p1",
    type: "Cause",
    status: "confirmed",
    label: "alpha",
    confidence: 0.7,
    supportedBy: [],
    relations: [],
    createdAt: "2026-04-26T00:00:00Z",
    lastConfirmedAt: null,
    staleAfter: null,
    supersededBy: null,
    bundleId: "bnd1",
    ...overrides,
  };
}

describe("FlowBlock.metadata roundtrip (PR-6)", () => {
  let root: string;
  let storage: FsStorage;
  let store: FlowGraphStore;
  let projector: FlowGraphProjector;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "metadata-rt-"));
    storage = new FsStorage(root);
    store = new FlowGraphStore(storage, new FakeClock());
    projector = new FlowGraphProjector();
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("metadata 없는 블록: appendDelta → readDeltas 라운드트립", async () => {
    const block = makeBlock({ blockId: "b1" });
    await store.appendDelta("p1", { op: "block-add", timestampIso: "2026-04-26T00:00:00Z", block });
    const deltas = await store.readDeltas("p1");
    expect(deltas).toHaveLength(1);
    const d = deltas[0]!;
    expect(d.op).toBe("block-add");
    if (d.op === "block-add") {
      expect(d.block.metadata).toBeUndefined();
    }
  });

  test("metadata 포함 블록: 라운드트립에서 모든 reserved key 보존", async () => {
    const metadata: FlowBlockMetadata = {
      author: "claude",
      subject: "auth-flow",
      source: "extractor-v1",
      confidenceLabel: "high",
      customExt: "ext-value",
    };
    const block = makeBlock({ blockId: "b1", metadata });
    await store.appendDelta("p1", { op: "block-add", timestampIso: "2026-04-26T00:00:00Z", block });
    const deltas = await store.readDeltas("p1");
    const d = deltas[0]!;
    if (d.op !== "block-add") throw new Error("expected block-add");
    expect(d.block.metadata).toEqual(metadata);
  });

  test("snapshot 라운드트립: writeSnapshot → readSnapshot → metadata 보존", async () => {
    const metadata: FlowBlockMetadata = { author: "claude", source: "test" };
    const block = makeBlock({ blockId: "b1", metadata });
    await store.appendDelta("p1", { op: "block-add", timestampIso: "2026-04-26T00:00:00Z", block });
    const deltas = await store.readDeltas("p1");
    const graph = projector.project("p1", deltas);
    await store.writeSnapshot("p1", graph);
    const restored = await store.readSnapshot("p1");
    expect(restored).not.toBeNull();
    expect(restored!.blocks).toHaveLength(1);
    expect(restored!.blocks[0]!.metadata).toEqual(metadata);
  });

  test("metadata.author=undefined인 필드는 직렬화 시 키 자체가 사라짐", async () => {
    const block = makeBlock({
      blockId: "b1",
      metadata: { author: undefined, subject: "x" },
    });
    await store.appendDelta("p1", { op: "block-add", timestampIso: "2026-04-26T00:00:00Z", block });
    const raw = await readFile(join(root, "problems/p1/flow-delta.jsonl"), "utf-8");
    const parsed = JSON.parse(raw.trim());
    expect(parsed.block.metadata).toEqual({ subject: "x" });
    expect("author" in parsed.block.metadata).toBe(false);
  });

  test("FlowGraphProjector.fold(): 다중 delta 통과 시 metadata 보존", async () => {
    const metadata: FlowBlockMetadata = { author: "claude", subject: "auth" };
    const block = makeBlock({ blockId: "b1", metadata });
    const relationDelta = {
      op: "relation-add" as const,
      timestampIso: "2026-04-26T00:01:00Z",
      problemId: "p1",
      fromBlockId: "b1",
      relation: { kind: "causes" as const, targetBlockId: "b2", confidence: 0.9 },
    };
    await store.appendDelta("p1", { op: "block-add", timestampIso: "2026-04-26T00:00:00Z", block });
    await store.appendDelta("p1", relationDelta);
    const deltas = await store.readDeltas("p1");
    const graph = projector.project("p1", deltas);
    expect(graph.blocks).toHaveLength(1);
    expect(graph.blocks[0]!.metadata).toEqual(metadata);
    expect(graph.blocks[0]!.relations).toHaveLength(1);
  });
});
