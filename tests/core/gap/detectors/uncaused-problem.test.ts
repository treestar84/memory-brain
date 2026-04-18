import { describe, test, expect } from "bun:test";
import { UncausedProblemDetector } from "../../../../src/core/gap/detectors/UncausedProblemDetector";
import { FakeClock } from "../../../../src/core/clock/Clock";
import type { FlowGraph, FlowBlock } from "../../../../src/core/flow/types";

const mkBlock = (over: Partial<FlowBlock>): FlowBlock => ({
  blockId: "x", problemId: "p", type: "Problem", status: "confirmed", label: "x",
  confidence: 0.8, supportedBy: [], relations: [], createdAt: "2026-04-18T00:00:00Z",
  lastConfirmedAt: null, staleAfter: null, supersededBy: null, bundleId: "bnd",
  ...over,
});

const mkGraph = (blocks: FlowBlock[]): FlowGraph => ({
  problemId: "p", blocks, cueCardMeta: { lastSyntheticAt: null, bodyHash: null, bodyBytes: 0, stale: false },
});

describe("UncausedProblemDetector", () => {
  const detector = new UncausedProblemDetector();
  const clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));

  test("Problem with no incoming causes → gap", () => {
    const graph = mkGraph([mkBlock({ blockId: "p1", type: "Problem" })]);
    const gaps = detector.detect(graph, clock);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].detectorId).toBe("rule:uncaused-problem");
    expect(gaps[0].subjectBlockId).toBe("p1");
  });

  test("Problem with incoming causes relation → no gap", () => {
    const graph = mkGraph([
      mkBlock({ blockId: "p1", type: "Problem" }),
      mkBlock({ blockId: "c1", type: "Cause",
        relations: [{ kind: "causes", targetBlockId: "p1", confidence: 0.9 }] }),
    ]);
    const gaps = detector.detect(graph, clock);
    expect(gaps.map((g) => g.subjectBlockId)).not.toContain("p1");
  });

  test("superseded Problem is ignored", () => {
    const graph = mkGraph([mkBlock({ blockId: "p1", type: "Problem", status: "superseded" })]);
    expect(detector.detect(graph, clock)).toHaveLength(0);
  });

  test("Non-Problem types are ignored", () => {
    const graph = mkGraph([mkBlock({ blockId: "h1", type: "Hypothesis" })]);
    expect(detector.detect(graph, clock)).toHaveLength(0);
  });
});
