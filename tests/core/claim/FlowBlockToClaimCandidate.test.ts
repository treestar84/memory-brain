import { describe, test, expect } from "bun:test";
import { FakeClock } from "../../../src/core/clock/Clock";
import {
  FlowBlockToClaimCandidate,
  CLAIM_CONFIDENCE_THRESHOLD,
  RULE_OUTCOME_PROMOTE,
  RULE_RULE_PROMOTE,
} from "../../../src/core/claim/FlowBlockToClaimCandidate";
import type { FlowBlock, FlowGraph } from "../../../src/core/flow/types";

function makeBlock(overrides: Partial<FlowBlock>): FlowBlock {
  return {
    blockId: "blk-1",
    problemId: "prob-1",
    type: "Outcome",
    status: "confirmed",
    label: "테스트 통과 → production deploy 가능",
    confidence: 0.9,
    supportedBy: [],
    relations: [],
    createdAt: "2026-04-26T00:00:00Z",
    lastConfirmedAt: null,
    staleAfter: null,
    supersededBy: null,
    bundleId: "bnd-1",
    ...overrides,
  };
}

function makeGraph(blocks: FlowBlock[]): FlowGraph {
  return {
    problemId: "prob-1",
    blocks,
    cueCardMeta: { lastSyntheticAt: null, bodyHash: null, bodyBytes: 0, stale: false },
  };
}

describe("FlowBlockToClaimCandidate", () => {
  const clock = new FakeClock(new Date("2026-04-26T10:00:00Z"));
  const detector = new FlowBlockToClaimCandidate(clock);

  test("Outcome confirmed + confidence ≥ 임계값 → 1건 후보", () => {
    const graph = makeGraph([makeBlock({ type: "Outcome", confidence: 0.85 })]);
    const out = detector.detect(graph);
    expect(out).toHaveLength(1);
    expect(out[0]!.proposedType).toBe("outcome");
    expect(out[0]!.detectedBy).toBe(RULE_OUTCOME_PROMOTE);
    expect(out[0]!.candidateId).toBe("claim-cand-blk-1");
    expect(out[0]!.evidence[0]!.source).toBe("flow-delta:bnd-1:blk-1");
  });

  test("Rule confirmed + confidence ≥ 임계값 → 1건 후보, type=rule", () => {
    const graph = makeGraph([makeBlock({ type: "Rule", blockId: "rule-1", confidence: 0.95 })]);
    const out = detector.detect(graph);
    expect(out).toHaveLength(1);
    expect(out[0]!.proposedType).toBe("rule");
    expect(out[0]!.detectedBy).toBe(RULE_RULE_PROMOTE);
  });

  test("Outcome confidence < 임계값 → skip", () => {
    const graph = makeGraph([makeBlock({ confidence: CLAIM_CONFIDENCE_THRESHOLD - 0.01 })]);
    expect(detector.detect(graph)).toHaveLength(0);
  });

  test("Outcome status superseded → skip", () => {
    const graph = makeGraph([makeBlock({ status: "superseded" })]);
    expect(detector.detect(graph)).toHaveLength(0);
  });

  test("Cause/Action/Hypothesis/Gap 등 → skip (Outcome/Rule만 변환)", () => {
    const graph = makeGraph([
      makeBlock({ blockId: "c", type: "Cause", confidence: 0.95 }),
      makeBlock({ blockId: "a", type: "Action", confidence: 0.95 }),
      makeBlock({ blockId: "h", type: "Hypothesis", confidence: 0.95 }),
      makeBlock({ blockId: "g", type: "Gap", confidence: 0.95 }),
    ]);
    expect(detector.detect(graph)).toHaveLength(0);
  });

  test("혼합 — confirmed Outcome 1, superseded Outcome 1, Rule 1 → 후보 2건", () => {
    const graph = makeGraph([
      makeBlock({ blockId: "ok-out", type: "Outcome", confidence: 0.9 }),
      makeBlock({ blockId: "old-out", type: "Outcome", confidence: 0.9, status: "superseded" }),
      makeBlock({ blockId: "ok-rule", type: "Rule", confidence: 0.85 }),
    ]);
    const out = detector.detect(graph);
    expect(out).toHaveLength(2);
    expect(out.map((c) => c.candidateId).sort()).toEqual(["claim-cand-ok-out", "claim-cand-ok-rule"]);
  });
});
