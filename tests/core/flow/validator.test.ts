import { describe, test, expect } from "bun:test";
import { FlowGraphValidator } from "../../../src/core/flow/FlowGraphValidator";
import type { FlowBlock, FlowDelta } from "../../../src/core/flow/types";

const mkBlock = (overrides: Partial<FlowBlock> = {}): FlowBlock => ({
  blockId: "blk_cause_1", problemId: "p1", type: "Cause",
  status: "confirmed", label: "x", confidence: 0.5,
  supportedBy: [], relations: [], createdAt: "2026-04-18T00:00:00Z",
  lastConfirmedAt: null, staleAfter: null, supersededBy: null, bundleId: "bnd",
  ...overrides,
});

describe("FlowGraphValidator", () => {
  const v = new FlowGraphValidator();

  test("validateBlock accepts valid block", () => {
    expect(v.validateBlock(mkBlock()).ok).toBe(true);
  });

  test("validateBlock rejects unknown type", () => {
    const res = v.validateBlock({ ...mkBlock(), type: "NotAType" as any });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("type");
  });

  test("validateBlock rejects confidence out of range", () => {
    expect(v.validateBlock({ ...mkBlock(), confidence: 1.5 }).ok).toBe(false);
    expect(v.validateBlock({ ...mkBlock(), confidence: -0.1 }).ok).toBe(false);
  });

  test("validateDelta accepts valid block-add", () => {
    const d: FlowDelta = { op: "block-add", timestampIso: "2026-04-18T00:00:00Z", block: mkBlock() };
    expect(v.validateDelta(d).ok).toBe(true);
  });

  test("validateDelta rejects relation-add with bad confidence", () => {
    const d: FlowDelta = {
      op: "relation-add", timestampIso: "2026-04-18T00:00:00Z",
      problemId: "p1", fromBlockId: "b1",
      relation: { kind: "causes", targetBlockId: "b2", confidence: 2 },
    };
    expect(v.validateDelta(d).ok).toBe(false);
  });

  test("detectCycles flags supersede cycle", () => {
    const blocks = [
      mkBlock({ blockId: "a", supersededBy: "b" }),
      mkBlock({ blockId: "b", supersededBy: "a" }),
    ];
    expect(v.detectSupersedeCycles(blocks).length).toBeGreaterThan(0);
  });

  test("detectCycles clean chain", () => {
    const blocks = [
      mkBlock({ blockId: "a", supersededBy: "b" }),
      mkBlock({ blockId: "b", supersededBy: null }),
    ];
    expect(v.detectSupersedeCycles(blocks)).toEqual([]);
  });

  test("validateRelationTargets requires target in same problem", () => {
    const blocks = [
      mkBlock({ blockId: "a", problemId: "p1",
        relations: [{ kind: "causes", targetBlockId: "b", confidence: 0.5 }] }),
      mkBlock({ blockId: "b", problemId: "p1" }),
    ];
    expect(v.validateRelationTargets(blocks).ok).toBe(true);

    const orphan = [
      mkBlock({ blockId: "a", problemId: "p1",
        relations: [{ kind: "causes", targetBlockId: "missing", confidence: 0.5 }] }),
    ];
    expect(v.validateRelationTargets(orphan).ok).toBe(false);
  });
});

describe("FlowGraphValidator — Epic 3 확장", () => {
  const validator = new FlowGraphValidator();
  const baseBlock = (over: Record<string, unknown> = {}) => ({
    blockId: "b1", problemId: "p1", type: "Problem" as const,
    status: "confirmed" as const, label: "x", confidence: 0.8,
    supportedBy: [], relations: [], createdAt: "2026-04-18T00:00:00Z",
    lastConfirmedAt: null, staleAfter: null, supersededBy: null, bundleId: "bnd",
    ...over,
  });

  test("Gap 블록에 detectorId·subject 없으면 reject", () => {
    const delta = { op: "block-add" as const, timestampIso: "2026-04-18T00:00:00Z",
      block: baseBlock({ type: "Gap" }) };
    expect(validator.validateDelta(delta as any).ok).toBe(false);
  });

  test("Gap 블록에 detectorId·subject 있으면 통과", () => {
    const delta = { op: "block-add" as const, timestampIso: "2026-04-18T00:00:00Z",
      block: baseBlock({ type: "Gap", detectorId: "semantic", subject: { blockId: "b2" } }) };
    expect(validator.validateDelta(delta as any).ok).toBe(true);
  });

  test("Gap detectorId rule:* reject (projection-derived만 허용)", () => {
    const delta = { op: "block-add" as const, timestampIso: "2026-04-18T00:00:00Z",
      block: baseBlock({ type: "Gap", detectorId: "rule:orphan-action", subject: { blockId: "b2" } }) };
    expect(validator.validateDelta(delta as any).ok).toBe(false);
  });

  test("Question 블록에 gapBlockId 없으면 reject", () => {
    const delta = { op: "block-add" as const, timestampIso: "2026-04-18T00:00:00Z",
      block: baseBlock({ type: "Question" }) };
    expect(validator.validateDelta(delta as any).ok).toBe(false);
  });

  test("Question 블록에 gapBlockId 있으면 통과", () => {
    const delta = { op: "block-add" as const, timestampIso: "2026-04-18T00:00:00Z",
      block: baseBlock({ type: "Question", gapBlockId: "gap:semantic:b2" }) };
    expect(validator.validateDelta(delta as any).ok).toBe(true);
  });

  test("Outcome polarity는 '+' | '-' | null만 허용", () => {
    const delta = { op: "block-add" as const, timestampIso: "2026-04-18T00:00:00Z",
      block: baseBlock({ type: "Outcome", polarity: "?" }) };
    expect(validator.validateDelta(delta as any).ok).toBe(false);
  });

  test("Outcome polarity '+' 통과, '-' 통과, null 통과, 미설정 통과", () => {
    for (const polarity of ["+", "-", null]) {
      const delta = { op: "block-add" as const, timestampIso: "2026-04-18T00:00:00Z",
        block: baseBlock({ type: "Outcome", polarity }) };
      expect(validator.validateDelta(delta as any).ok).toBe(true);
    }
    const delta = { op: "block-add" as const, timestampIso: "2026-04-18T00:00:00Z",
      block: baseBlock({ type: "Outcome" }) };
    expect(validator.validateDelta(delta as any).ok).toBe(true);
  });
});
