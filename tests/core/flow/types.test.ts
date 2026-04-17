import { describe, test, expect } from "bun:test";
import {
  isFlowBlock, isFlowDelta, isObservationBundle,
  isRelation, isFlowBlockType, isRelationKind,
} from "../../../src/core/flow/guards";

describe("Flow type guards", () => {
  test("isFlowBlockType accepts all 13 types", () => {
    ["Problem","State","Trigger","Context","Constraint","Cause","Hypothesis",
     "Action","Evidence","Outcome","Rule","Gap","Question"].forEach(t => {
      expect(isFlowBlockType(t)).toBe(true);
    });
    expect(isFlowBlockType("Unknown")).toBe(false);
  });

  test("isRelationKind accepts 5 kinds", () => {
    ["causes","evidencedBy","mitigatedBy","validatedBy","followsFrom"].forEach(k => {
      expect(isRelationKind(k)).toBe(true);
    });
    expect(isRelationKind("unknown")).toBe(false);
  });

  test("isRelation requires kind+target+confidence", () => {
    expect(isRelation({ kind: "causes", targetBlockId: "blk_x", confidence: 0.8 })).toBe(true);
    expect(isRelation({ kind: "causes", targetBlockId: "blk_x" })).toBe(false);
    expect(isRelation({ kind: "bad", targetBlockId: "blk_x", confidence: 0.8 })).toBe(false);
  });

  test("isFlowBlock requires all fields", () => {
    const block = {
      blockId: "blk_cause_abcd1234", problemId: "problem-x", type: "Cause",
      status: "confirmed", label: "test", confidence: 0.8,
      supportedBy: ["obs_1"], relations: [], createdAt: "2026-04-18T00:00:00Z",
      lastConfirmedAt: null, staleAfter: null, supersededBy: null, bundleId: "bnd_x",
    };
    expect(isFlowBlock(block)).toBe(true);
    expect(isFlowBlock({ ...block, type: "NotAType" })).toBe(false);
    expect(isFlowBlock({ ...block, confidence: 1.5 })).toBe(false);
  });

  test("isFlowDelta accepts 4 ops", () => {
    expect(isFlowDelta({ op: "block-add", timestampIso: "2026-04-18T00:00:00Z",
      block: { blockId: "b", problemId: "p", type: "Cause", status: "confirmed",
        label: "x", confidence: 0.5, supportedBy: [], relations: [],
        createdAt: "2026-04-18T00:00:00Z", lastConfirmedAt: null,
        staleAfter: null, supersededBy: null, bundleId: "bnd" } })).toBe(true);
    expect(isFlowDelta({ op: "block-supersede", timestampIso: "x",
      problemId: "p1", blockId: "b1", supersededBy: "b2", reason: "r" })).toBe(true);
    expect(isFlowDelta({ op: "relation-add", timestampIso: "x",
      problemId: "p1", fromBlockId: "b1", relation: { kind: "causes", targetBlockId: "b2", confidence: 0.5 } })).toBe(true);
    expect(isFlowDelta({ op: "cue-card-regen", timestampIso: "x",
      problemId: "p", bodyHash: "abc", bodyBytes: 100 })).toBe(true);
    expect(isFlowDelta({ op: "unknown" })).toBe(false);
  });

  test("isObservationBundle requires all fields", () => {
    const b = {
      bundleId: "bnd_s_1", activeProblemId: "p", sessionId: "s",
      turnOrdinal: 1, openedAt: "2026-04-18T00:00:00Z",
      sealedAt: "2026-04-18T00:00:01Z", eventIds: ["e1"], observations: [],
      metrics: { toolCallCounts: {}, touchedFiles: [], bashExit: { success: 0, failure: 0 }, promptCount: 0 },
      recentBlockIds: [], processedAt: null, processedByVersion: null,
    };
    expect(isObservationBundle(b)).toBe(true);
    expect(isObservationBundle({ ...b, turnOrdinal: "1" })).toBe(false);
  });
});
