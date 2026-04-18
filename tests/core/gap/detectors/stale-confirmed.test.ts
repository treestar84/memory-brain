import { describe, test, expect } from "bun:test";
import { StaleConfirmedDetector } from "../../../../src/core/gap/detectors/StaleConfirmedDetector";
import { FakeClock } from "../../../../src/core/clock/Clock";
import type { FlowGraph, FlowBlock } from "../../../../src/core/flow/types";

const mkBlock = (over: Partial<FlowBlock>): FlowBlock => ({
  blockId: "x", problemId: "p", type: "Hypothesis", status: "confirmed", label: "x",
  confidence: 0.8, supportedBy: [], relations: [], createdAt: "2026-04-01T00:00:00Z",
  lastConfirmedAt: null, staleAfter: null, supersededBy: null, bundleId: "bnd",
  ...over,
});

const mkGraph = (blocks: FlowBlock[]): FlowGraph => ({
  problemId: "p", blocks, cueCardMeta: { lastSyntheticAt: null, bodyHash: null, bodyBytes: 0, stale: false },
});

describe("StaleConfirmedDetector", () => {
  const detector = new StaleConfirmedDetector();
  const clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));

  test("block with explicit staleAfter in past → gap", () => {
    const graph = mkGraph([
      mkBlock({ blockId: "b1", lastConfirmedAt: "2026-04-10T00:00:00Z",
        staleAfter: "2026-04-15T00:00:00Z" }),
    ]);
    const gaps = detector.detect(graph, clock);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].detectorId).toBe("rule:stale-confirmed");
    expect(gaps[0].subjectBlockId).toBe("b1");
  });

  test("block within default stale window → no gap", () => {
    const graph = mkGraph([
      mkBlock({ blockId: "b1", lastConfirmedAt: "2026-04-17T00:00:00Z" }),
    ]);
    expect(detector.detect(graph, clock)).toHaveLength(0);
  });

  test("block past default stale window → gap with days extra", () => {
    const graph = mkGraph([
      mkBlock({ blockId: "b1", lastConfirmedAt: "2026-04-01T00:00:00Z" }),
    ]);
    const gaps = detector.detect(graph, clock);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].extra?.days).toBeGreaterThanOrEqual(7);
  });

  test("Gap and Question types are skipped", () => {
    const graph = mkGraph([
      mkBlock({ blockId: "g1", type: "Gap", lastConfirmedAt: "2026-01-01T00:00:00Z" }),
      mkBlock({ blockId: "q1", type: "Question", lastConfirmedAt: "2026-01-01T00:00:00Z" }),
    ]);
    expect(detector.detect(graph, clock)).toHaveLength(0);
  });

  test("lastConfirmedAt null → skipped", () => {
    const graph = mkGraph([mkBlock({ blockId: "b1", lastConfirmedAt: null })]);
    expect(detector.detect(graph, clock)).toHaveLength(0);
  });

  test("superseded block is ignored", () => {
    const graph = mkGraph([
      mkBlock({ blockId: "b1", status: "superseded",
        lastConfirmedAt: "2026-01-01T00:00:00Z" }),
    ]);
    expect(detector.detect(graph, clock)).toHaveLength(0);
  });
});
