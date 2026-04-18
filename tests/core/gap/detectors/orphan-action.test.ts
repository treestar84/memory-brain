import { describe, test, expect } from "bun:test";
import { OrphanActionDetector } from "../../../../src/core/gap/detectors/OrphanActionDetector";
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

describe("OrphanActionDetector", () => {
  const detector = new OrphanActionDetector();
  const clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));

  test("Action with no followsFrom Outcome → gap", () => {
    const graph = mkGraph([mkBlock({ blockId: "a1", type: "Action" })]);
    const gaps = detector.detect(graph, clock);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].subjectBlockId).toBe("a1");
    expect(gaps[0].detectorId).toBe("rule:orphan-action");
  });

  test("Action followsFrom Outcome → no gap", () => {
    const graph = mkGraph([
      mkBlock({ blockId: "a1", type: "Action",
        relations: [{ kind: "followsFrom", targetBlockId: "o1", confidence: 0.9 }] }),
      mkBlock({ blockId: "o1", type: "Outcome" }),
    ]);
    expect(detector.detect(graph, clock)).toHaveLength(0);
  });

  test("followsFrom Outcome is superseded → gap", () => {
    const graph = mkGraph([
      mkBlock({ blockId: "a1", type: "Action",
        relations: [{ kind: "followsFrom", targetBlockId: "o1", confidence: 0.9 }] }),
      mkBlock({ blockId: "o1", type: "Outcome", status: "superseded" }),
    ]);
    expect(detector.detect(graph, clock)).toHaveLength(1);
  });

  test("superseded Action is ignored", () => {
    const graph = mkGraph([mkBlock({ blockId: "a1", type: "Action", status: "superseded" })]);
    expect(detector.detect(graph, clock)).toHaveLength(0);
  });
});
