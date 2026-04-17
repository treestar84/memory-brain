import { describe, test, expect } from "bun:test";
import { FlowGraphProjector } from "../../../src/core/flow/FlowGraphProjector";
import type { FlowBlock, FlowDelta } from "../../../src/core/flow/types";

const mkBlock = (id: string, overrides: Partial<FlowBlock> = {}): FlowBlock => ({
  blockId: id, problemId: "p1", type: "Cause", status: "confirmed",
  label: id, confidence: 0.5, supportedBy: [], relations: [],
  createdAt: "2026-04-18T00:00:00Z", lastConfirmedAt: null,
  staleAfter: null, supersededBy: null, bundleId: "bnd", ...overrides,
});

const addDelta = (b: FlowBlock, t = "2026-04-18T00:00:00Z"): FlowDelta =>
  ({ op: "block-add", timestampIso: t, block: b });

describe("FlowGraphProjector", () => {
  const p = new FlowGraphProjector();

  test("empty deltas produce empty graph", () => {
    const g = p.project("p1", []);
    expect(g.blocks).toEqual([]);
    expect(g.cueCardMeta.stale).toBe(false);
  });

  test("block-add appends to graph", () => {
    const g = p.project("p1", [addDelta(mkBlock("a"))]);
    expect(g.blocks).toHaveLength(1);
    expect(g.blocks[0].blockId).toBe("a");
  });

  test("block-supersede marks status", () => {
    const deltas: FlowDelta[] = [
      addDelta(mkBlock("a")),
      addDelta(mkBlock("b")),
      { op: "block-supersede", timestampIso: "2026-04-18T00:01:00Z",
        problemId: "p1", blockId: "a", supersededBy: "b", reason: "refined" },
    ];
    const g = p.project("p1", deltas);
    const a = g.blocks.find(b => b.blockId === "a")!;
    expect(a.status).toBe("superseded");
    expect(a.supersededBy).toBe("b");
  });

  test("relation-add attaches to source block", () => {
    const deltas: FlowDelta[] = [
      addDelta(mkBlock("a")), addDelta(mkBlock("b")),
      { op: "relation-add", timestampIso: "2026-04-18T00:01:00Z",
        problemId: "p1", fromBlockId: "a",
        relation: { kind: "causes", targetBlockId: "b", confidence: 0.8 } },
    ];
    const g = p.project("p1", deltas);
    const a = g.blocks.find(b => b.blockId === "a")!;
    expect(a.relations).toHaveLength(1);
    expect(a.relations[0].targetBlockId).toBe("b");
  });

  test("cue-card-regen updates meta", () => {
    const deltas: FlowDelta[] = [
      { op: "cue-card-regen", timestampIso: "2026-04-18T00:01:00Z",
        problemId: "p1", bodyHash: "abc123", bodyBytes: 500 },
    ];
    const g = p.project("p1", deltas);
    expect(g.cueCardMeta.bodyHash).toBe("abc123");
    expect(g.cueCardMeta.bodyBytes).toBe(500);
    expect(g.cueCardMeta.lastSyntheticAt).toBe("2026-04-18T00:01:00Z");
  });

  test("projection is deterministic for same input", () => {
    const deltas: FlowDelta[] = [
      addDelta(mkBlock("a")), addDelta(mkBlock("b")),
      { op: "relation-add", timestampIso: "2026-04-18T00:01:00Z",
        problemId: "p1", fromBlockId: "a",
        relation: { kind: "causes", targetBlockId: "b", confidence: 0.8 } },
    ];
    const g1 = p.project("p1", deltas);
    const g2 = p.project("p1", deltas);
    expect(g1).toEqual(g2);
  });

  test("stale flag true when delta count exceeds threshold", () => {
    const deltas: FlowDelta[] = Array.from({ length: 101 }, (_, i) => addDelta(mkBlock(`b${i}`)));
    const g = p.project("p1", deltas);
    expect(g.cueCardMeta.stale).toBe(true);
  });

  test("ignores deltas for other problems", () => {
    const deltas: FlowDelta[] = [
      addDelta(mkBlock("a", { problemId: "p1" })),
      addDelta(mkBlock("x", { problemId: "p2" })),
    ];
    const g = p.project("p1", deltas);
    expect(g.blocks).toHaveLength(1);
    expect(g.blocks[0].blockId).toBe("a");
  });
});
