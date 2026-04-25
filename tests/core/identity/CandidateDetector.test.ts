import { describe, test, expect } from "bun:test";
import { FakeClock } from "../../../src/core/clock/Clock";
import { CandidateDetector, HIGH_TOOL_CALL_THRESHOLD } from "../../../src/core/identity/CandidateDetector";
import type { ObservationBundle } from "../../../src/core/flow/types";

function makeBundle(toolCallCounts: Record<string, number>): ObservationBundle {
  return {
    bundleId: "bnd-x",
    activeProblemId: "p1",
    sessionId: "s1",
    turnOrdinal: 1,
    openedAt: "2026-04-26T00:00:00Z",
    sealedAt: "2026-04-26T00:01:00Z",
    eventIds: [],
    observations: [],
    metrics: {
      toolCallCounts,
      touchedFiles: [],
      bashExit: { success: 0, failure: 0 },
      promptCount: 0,
    },
    recentBlockIds: [],
    processedAt: null,
    processedByVersion: null,
  };
}

describe("CandidateDetector", () => {
  const detector = new CandidateDetector(new FakeClock());

  test("빈 metrics → []", () => {
    expect(detector.detect(makeBundle({}))).toEqual([]);
  });

  test("tool 임계값 미달(4회) → []", () => {
    expect(detector.detect(makeBundle({ Bash: HIGH_TOOL_CALL_THRESHOLD - 1 }))).toEqual([]);
  });

  test("tool 임계값(5회) → 후보 1건, proposedTarget=tools", () => {
    const cands = detector.detect(makeBundle({ Bash: HIGH_TOOL_CALL_THRESHOLD }));
    expect(cands).toHaveLength(1);
    expect(cands[0]!.proposedTarget).toBe("tools");
    expect(cands[0]!.detectedBy).toBe("high-tool-call-pattern");
    expect(cands[0]!.metrics.toolCallCount).toBe(HIGH_TOOL_CALL_THRESHOLD);
    expect(cands[0]!.status).toBe("pending");
    expect(cands[0]!.proposedLabel).toContain("Bash");
  });

  test("여러 tool 각각 ≥ 5 → 각각 후보", () => {
    const cands = detector.detect(makeBundle({ Bash: 6, Edit: 7, Read: 3 }));
    expect(cands).toHaveLength(2);
    const tools = cands.map((c) => c.proposedLabel.match(/패턴: (\w+)/)?.[1]).sort();
    expect(tools).toEqual(["Bash", "Edit"]);
  });
});
