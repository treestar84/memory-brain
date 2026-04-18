import { describe, test, expect } from "bun:test";
import { UnmitigatedCauseDetector } from "../../../../src/core/gap/detectors/UnmitigatedCauseDetector";
import { FakeClock } from "../../../../src/core/clock/Clock";
import type { FlowGraph, FlowBlock } from "../../../../src/core/flow/types";

const mkBlock = (over: Partial<FlowBlock>): FlowBlock => ({
  blockId: "x", problemId: "p", type: "Cause", status: "confirmed", label: "x",
  confidence: 0.8, supportedBy: [], relations: [], createdAt: "2026-04-18T00:00:00Z",
  lastConfirmedAt: null, staleAfter: null, supersededBy: null, bundleId: "bnd",
  ...over,
});

const mkGraph = (blocks: FlowBlock[]): FlowGraph => ({
  problemId: "p", blocks, cueCardMeta: { lastSyntheticAt: null, bodyHash: null, bodyBytes: 0, stale: false },
});

describe("UnmitigatedCauseDetector", () => {
  const detector = new UnmitigatedCauseDetector();
  const clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));

  test("Cause with no mitigatedBy → gap", () => {
    const graph = mkGraph([mkBlock({ blockId: "c1", type: "Cause" })]);
    const gaps = detector.detect(graph, clock);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].detectorId).toBe("rule:unmitigated-cause");
    expect(gaps[0].subjectBlockId).toBe("c1");
  });

  test("Cause with mitigatedBy confirmed Action → no gap", () => {
    const graph = mkGraph([
      mkBlock({ blockId: "c1", type: "Cause",
        relations: [{ kind: "mitigatedBy", targetBlockId: "a1", confidence: 0.9 }] }),
      mkBlock({ blockId: "a1", type: "Action" }),
    ]);
    expect(detector.detect(graph, clock)).toHaveLength(0);
  });

  test("mitigatedBy target is superseded Action → gap", () => {
    const graph = mkGraph([
      mkBlock({ blockId: "c1", type: "Cause",
        relations: [{ kind: "mitigatedBy", targetBlockId: "a1", confidence: 0.9 }] }),
      mkBlock({ blockId: "a1", type: "Action", status: "superseded" }),
    ]);
    expect(detector.detect(graph, clock)).toHaveLength(1);
  });

  test("superseded Cause is ignored", () => {
    const graph = mkGraph([mkBlock({ blockId: "c1", type: "Cause", status: "superseded" })]);
    expect(detector.detect(graph, clock)).toHaveLength(0);
  });

  test("Non-Cause types are ignored", () => {
    const graph = mkGraph([mkBlock({ blockId: "p1", type: "Problem" })]);
    expect(detector.detect(graph, clock)).toHaveLength(0);
  });
});
