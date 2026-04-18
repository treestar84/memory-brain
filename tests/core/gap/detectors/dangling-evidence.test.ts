import { describe, test, expect } from "bun:test";
import { DanglingEvidenceDetector } from "../../../../src/core/gap/detectors/DanglingEvidenceDetector";
import { FakeClock } from "../../../../src/core/clock/Clock";
import type { FlowGraph, FlowBlock } from "../../../../src/core/flow/types";

const mkBlock = (over: Partial<FlowBlock>): FlowBlock => ({
  blockId: "x", problemId: "p", type: "Evidence", status: "confirmed", label: "x",
  confidence: 0.8, supportedBy: [], relations: [], createdAt: "2026-04-18T00:00:00Z",
  lastConfirmedAt: null, staleAfter: null, supersededBy: null, bundleId: "bnd",
  ...over,
});

const mkGraph = (blocks: FlowBlock[]): FlowGraph => ({
  problemId: "p", blocks, cueCardMeta: { lastSyntheticAt: null, bodyHash: null, bodyBytes: 0, stale: false },
});

describe("DanglingEvidenceDetector", () => {
  const detector = new DanglingEvidenceDetector();
  const clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));

  test("Evidence not referenced by anyone → gap", () => {
    const graph = mkGraph([mkBlock({ blockId: "e1", type: "Evidence" })]);
    const gaps = detector.detect(graph, clock);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].detectorId).toBe("rule:dangling-evidence");
    expect(gaps[0].subjectBlockId).toBe("e1");
  });

  test("Evidence referenced by evidencedBy → no gap", () => {
    const graph = mkGraph([
      mkBlock({ blockId: "e1", type: "Evidence" }),
      mkBlock({ blockId: "h1", type: "Hypothesis",
        relations: [{ kind: "evidencedBy", targetBlockId: "e1", confidence: 0.9 }] }),
    ]);
    const gaps = detector.detect(graph, clock);
    expect(gaps.map((g) => g.subjectBlockId)).not.toContain("e1");
  });

  test("Evidence referenced by validatedBy → no gap", () => {
    const graph = mkGraph([
      mkBlock({ blockId: "e1", type: "Evidence" }),
      mkBlock({ blockId: "o1", type: "Outcome",
        relations: [{ kind: "validatedBy", targetBlockId: "e1", confidence: 0.9 }] }),
    ]);
    const gaps = detector.detect(graph, clock);
    expect(gaps.map((g) => g.subjectBlockId)).not.toContain("e1");
  });

  test("superseded Evidence is ignored", () => {
    const graph = mkGraph([mkBlock({ blockId: "e1", type: "Evidence", status: "superseded" })]);
    expect(detector.detect(graph, clock)).toHaveLength(0);
  });

  test("Non-Evidence types are ignored", () => {
    const graph = mkGraph([mkBlock({ blockId: "h1", type: "Hypothesis" })]);
    expect(detector.detect(graph, clock)).toHaveLength(0);
  });
});
