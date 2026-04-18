import { describe, test, expect } from "bun:test";
import { UnsupportedHypothesisDetector } from "../../../../src/core/gap/detectors/UnsupportedHypothesisDetector";
import { FakeClock } from "../../../../src/core/clock/Clock";
import type { FlowGraph, FlowBlock } from "../../../../src/core/flow/types";

const mkBlock = (over: Partial<FlowBlock>): FlowBlock => ({
  blockId: "x", problemId: "p", type: "Hypothesis", status: "confirmed", label: "x",
  confidence: 0.8, supportedBy: [], relations: [], createdAt: "2026-04-18T00:00:00Z",
  lastConfirmedAt: null, staleAfter: null, supersededBy: null, bundleId: "bnd",
  ...over,
});

const mkGraph = (blocks: FlowBlock[]): FlowGraph => ({
  problemId: "p", blocks, cueCardMeta: { lastSyntheticAt: null, bodyHash: null, bodyBytes: 0, stale: false },
});

describe("UnsupportedHypothesisDetector", () => {
  const detector = new UnsupportedHypothesisDetector();
  const clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));

  test("Hypothesis without evidencedBy → gap", () => {
    const graph = mkGraph([mkBlock({ blockId: "h1", type: "Hypothesis" })]);
    const gaps = detector.detect(graph, clock);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].subjectBlockId).toBe("h1");
    expect(gaps[0].detectorId).toBe("rule:unsupported-hypothesis");
  });

  test("Hypothesis with incoming evidencedBy → no gap", () => {
    const graph = mkGraph([
      mkBlock({ blockId: "h1", type: "Hypothesis" }),
      mkBlock({ blockId: "h2", type: "Hypothesis",
        relations: [{ kind: "evidencedBy", targetBlockId: "h1", confidence: 0.8 }] }),
    ]);
    // h1 is referenced as evidencedBy target → not a gap
    const gaps = detector.detect(graph, clock);
    expect(gaps.map((g) => g.subjectBlockId)).not.toContain("h1");
  });

  test("superseded Hypothesis is ignored", () => {
    const graph = mkGraph([mkBlock({ blockId: "h1", type: "Hypothesis", status: "superseded" })]);
    expect(detector.detect(graph, clock)).toHaveLength(0);
  });

  test("Non-Hypothesis types are ignored", () => {
    const graph = mkGraph([mkBlock({ blockId: "c1", type: "Cause" })]);
    expect(detector.detect(graph, clock)).toHaveLength(0);
  });
});
