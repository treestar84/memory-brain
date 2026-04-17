import { describe, test, expect, beforeEach } from "bun:test";
import { FlowGraphStore } from "../../../src/core/flow/FlowGraphStore";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";
import type { FlowDelta, FlowGraph } from "../../../src/core/flow/types";

describe("FlowGraphStore", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let store: FlowGraphStore;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));
    store = new FlowGraphStore(storage, clock);
  });

  test("appendDelta writes to problem's delta log", async () => {
    const d: FlowDelta = {
      op: "block-add", timestampIso: clock.isoNow(),
      block: { blockId: "b1", problemId: "p1", type: "Cause", status: "confirmed",
        label: "x", confidence: 0.7, supportedBy: [], relations: [],
        createdAt: clock.isoNow(), lastConfirmedAt: null, staleAfter: null,
        supersededBy: null, bundleId: "bnd" },
    };
    await store.appendDelta("p1", d);
    const deltas = await store.readDeltas("p1");
    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toEqual(d);
  });

  test("readDeltas returns empty array for unknown problem", async () => {
    expect(await store.readDeltas("missing")).toEqual([]);
  });

  test("writeSnapshot and readSnapshot round-trip", async () => {
    const graph: FlowGraph = {
      problemId: "p1", blocks: [],
      cueCardMeta: { lastSyntheticAt: null, bodyHash: null, bodyBytes: 0, stale: false },
    };
    await store.writeSnapshot("p1", graph);
    expect(await store.readSnapshot("p1")).toEqual(graph);
  });

  test("readSnapshot returns null for missing", async () => {
    expect(await store.readSnapshot("missing")).toBeNull();
  });

  test("appendDelta preserves order under concurrency", async () => {
    const baseBlock = (id: string): FlowDelta => ({
      op: "block-add", timestampIso: clock.isoNow(),
      block: { blockId: id, problemId: "p1", type: "Cause", status: "confirmed",
        label: id, confidence: 0.5, supportedBy: [], relations: [],
        createdAt: clock.isoNow(), lastConfirmedAt: null, staleAfter: null,
        supersededBy: null, bundleId: "bnd" },
    });
    await Promise.all(Array.from({ length: 20 }, (_, i) => store.appendDelta("p1", baseBlock(`b${i}`))));
    const deltas = await store.readDeltas("p1");
    expect(deltas).toHaveLength(20);
  });

  test("deltaLogPath scopes by problem", async () => {
    const d: FlowDelta = {
      op: "cue-card-regen", timestampIso: clock.isoNow(),
      problemId: "p1", bodyHash: "h", bodyBytes: 100,
    };
    await store.appendDelta("p1", d);
    await store.appendDelta("p2", { ...d, problemId: "p2" });
    expect(await store.readDeltas("p1")).toHaveLength(1);
    expect(await store.readDeltas("p2")).toHaveLength(1);
  });
});
