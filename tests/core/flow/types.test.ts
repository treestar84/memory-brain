import { describe, test, expect } from "bun:test";
import {
  isFlowBlock, isFlowDelta, isObservationBundle,
  isRelation, isFlowBlockType, isRelationKind,
  isFlowBlockMetadata,
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

  describe("FlowBlockMetadata (PR-6)", () => {
    const baseBlock = {
      blockId: "blk_x", problemId: "p1", type: "Cause" as const,
      status: "confirmed" as const, label: "test", confidence: 0.7,
      supportedBy: [], relations: [], createdAt: "2026-04-26T00:00:00Z",
      lastConfirmedAt: null, staleAfter: null, supersededBy: null, bundleId: "bnd_x",
    };

    test("metadata 미포함 블록은 통과", () => {
      expect(isFlowBlock(baseBlock)).toBe(true);
    });

    test("metadata가 빈 객체면 통과", () => {
      expect(isFlowBlock({ ...baseBlock, metadata: {} })).toBe(true);
    });

    test("reserved key (author/subject/source/confidenceLabel) 모두 string이면 통과", () => {
      expect(isFlowBlock({
        ...baseBlock,
        metadata: { author: "claude", subject: "auth", source: "extractor-v1", confidenceLabel: "high" },
      })).toBe(true);
    });

    test("확장 슬롯 임의 키 + string 값이면 통과", () => {
      expect(isFlowBlock({ ...baseBlock, metadata: { foo: "bar", customX: "y" } })).toBe(true);
    });

    test("metadata 값에 number가 들어가면 거부", () => {
      expect(isFlowBlock({ ...baseBlock, metadata: { x: 123 } })).toBe(false);
    });

    test("metadata 값에 boolean이 들어가면 거부", () => {
      expect(isFlowBlock({ ...baseBlock, metadata: { x: true } })).toBe(false);
    });

    test("metadata가 array면 거부", () => {
      expect(isFlowBlock({ ...baseBlock, metadata: ["a", "b"] })).toBe(false);
    });

    test("metadata가 null이면 거부", () => {
      expect(isFlowBlock({ ...baseBlock, metadata: null })).toBe(false);
    });

    test("metadata 값에 undefined 허용 (key 자체는 키지만 값 없음)", () => {
      expect(isFlowBlock({ ...baseBlock, metadata: { author: undefined, subject: "x" } })).toBe(true);
    });

    test("isFlowBlockMetadata 단독: 다양한 케이스", () => {
      expect(isFlowBlockMetadata(undefined)).toBe(true);
      expect(isFlowBlockMetadata({})).toBe(true);
      expect(isFlowBlockMetadata({ author: "x" })).toBe(true);
      expect(isFlowBlockMetadata(null)).toBe(false);
      expect(isFlowBlockMetadata(["a"])).toBe(false);
      expect(isFlowBlockMetadata({ x: 1 })).toBe(false);
    });
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
