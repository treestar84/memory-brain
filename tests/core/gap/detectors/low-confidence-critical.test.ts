import { describe, test, expect } from "bun:test";
import { LowConfidenceCriticalDetector } from "../../../../src/core/gap/detectors/LowConfidenceCriticalDetector";
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

describe("LowConfidenceCriticalDetector", () => {
  const detector = new LowConfidenceCriticalDetector();
  const clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));

  test("Hypothesis with confidence < 0.5 → gap", () => {
    const graph = mkGraph([mkBlock({ blockId: "h1", type: "Hypothesis", confidence: 0.3 })]);
    const gaps = detector.detect(graph, clock);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].detectorId).toBe("rule:low-confidence-critical");
    expect(gaps[0].label).toContain("0.30");
  });

  test("Hypothesis with confidence ≥ 0.5 → no gap", () => {
    const graph = mkGraph([mkBlock({ blockId: "h1", type: "Hypothesis", confidence: 0.5 })]);
    expect(detector.detect(graph, clock)).toHaveLength(0);
  });

  test("Cause and Outcome types are also checked", () => {
    const graph = mkGraph([
      mkBlock({ blockId: "c1", type: "Cause", confidence: 0.2 }),
      mkBlock({ blockId: "o1", type: "Outcome", confidence: 0.1 }),
    ]);
    expect(detector.detect(graph, clock)).toHaveLength(2);
  });

  test("non-critical types (Action) with low confidence → no gap", () => {
    const graph = mkGraph([mkBlock({ blockId: "a1", type: "Action", confidence: 0.1 })]);
    expect(detector.detect(graph, clock)).toHaveLength(0);
  });

  test("superseded block is ignored", () => {
    const graph = mkGraph([
      mkBlock({ blockId: "h1", type: "Hypothesis", confidence: 0.2, status: "superseded" }),
    ]);
    expect(detector.detect(graph, clock)).toHaveLength(0);
  });
});
