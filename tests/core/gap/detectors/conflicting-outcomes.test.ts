import { describe, test, expect } from "bun:test";
import { ConflictingOutcomesDetector } from "../../../../src/core/gap/detectors/ConflictingOutcomesDetector";
import { FakeClock } from "../../../../src/core/clock/Clock";
import type { FlowGraph, FlowBlock } from "../../../../src/core/flow/types";

const mkBlock = (over: Partial<FlowBlock>): FlowBlock => ({
  blockId: "x", problemId: "p", type: "Action", status: "confirmed", label: "x",
  confidence: 0.8, supportedBy: [], relations: [], createdAt: "2026-04-18T00:00:00Z",
  lastConfirmedAt: null, staleAfter: null, supersededBy: null, bundleId: "bnd",
  ...over,
});

const mkGraph = (blocks: FlowBlock[]): FlowGraph => ({
  problemId: "p", blocks, cueCardMeta: { lastSyntheticAt: null, bodyHash: null, bodyBytes: 0, stale: false },
});

describe("ConflictingOutcomesDetector", () => {
  const detector = new ConflictingOutcomesDetector();
  const clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));

  test("Action with both + and - outcomes → gap", () => {
    const graph = mkGraph([
      mkBlock({ blockId: "a1", type: "Action",
        relations: [
          { kind: "followsFrom", targetBlockId: "o1", confidence: 0.8 },
          { kind: "followsFrom", targetBlockId: "o2", confidence: 0.8 },
        ] }),
      mkBlock({ blockId: "o1", type: "Outcome", polarity: "+" }),
      mkBlock({ blockId: "o2", type: "Outcome", polarity: "-" }),
    ]);
    const gaps = detector.detect(graph, clock);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].detectorId).toBe("rule:conflicting-outcomes");
    expect(gaps[0].subjectBlockId).toBe("a1");
  });

  test("Action with only + outcomes → no gap", () => {
    const graph = mkGraph([
      mkBlock({ blockId: "a1", type: "Action",
        relations: [
          { kind: "followsFrom", targetBlockId: "o1", confidence: 0.8 },
          { kind: "followsFrom", targetBlockId: "o2", confidence: 0.8 },
        ] }),
      mkBlock({ blockId: "o1", type: "Outcome", polarity: "+" }),
      mkBlock({ blockId: "o2", type: "Outcome", polarity: "+" }),
    ]);
    expect(detector.detect(graph, clock)).toHaveLength(0);
  });

  test("superseded Outcome with conflicting polarity is ignored", () => {
    const graph = mkGraph([
      mkBlock({ blockId: "a1", type: "Action",
        relations: [
          { kind: "followsFrom", targetBlockId: "o1", confidence: 0.8 },
          { kind: "followsFrom", targetBlockId: "o2", confidence: 0.8 },
        ] }),
      mkBlock({ blockId: "o1", type: "Outcome", polarity: "+" }),
      mkBlock({ blockId: "o2", type: "Outcome", polarity: "-", status: "superseded" }),
    ]);
    expect(detector.detect(graph, clock)).toHaveLength(0);
  });

  test("superseded Action is ignored", () => {
    const graph = mkGraph([
      mkBlock({ blockId: "a1", type: "Action", status: "superseded",
        relations: [
          { kind: "followsFrom", targetBlockId: "o1", confidence: 0.8 },
          { kind: "followsFrom", targetBlockId: "o2", confidence: 0.8 },
        ] }),
      mkBlock({ blockId: "o1", type: "Outcome", polarity: "+" }),
      mkBlock({ blockId: "o2", type: "Outcome", polarity: "-" }),
    ]);
    expect(detector.detect(graph, clock)).toHaveLength(0);
  });

  test("null polarity outcomes do not conflict", () => {
    const graph = mkGraph([
      mkBlock({ blockId: "a1", type: "Action",
        relations: [
          { kind: "followsFrom", targetBlockId: "o1", confidence: 0.8 },
          { kind: "followsFrom", targetBlockId: "o2", confidence: 0.8 },
        ] }),
      mkBlock({ blockId: "o1", type: "Outcome", polarity: null }),
      mkBlock({ blockId: "o2", type: "Outcome", polarity: "+" }),
    ]);
    expect(detector.detect(graph, clock)).toHaveLength(0);
  });
});
