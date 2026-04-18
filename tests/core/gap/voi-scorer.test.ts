import { describe, test, expect } from "bun:test";
import { VoiScorer } from "../../../src/core/gap/VoiScorer";
import { FakeClock } from "../../../src/core/clock/Clock";
import type { FlowGraph, FlowBlock } from "../../../src/core/flow/types";

const mkBlock = (over: Partial<FlowBlock>): FlowBlock => ({
  blockId: "x",
  problemId: "p",
  type: "Hypothesis",
  status: "confirmed",
  label: "x",
  confidence: 0.5,
  supportedBy: [],
  relations: [],
  createdAt: "2026-04-18T10:00:00Z",
  lastConfirmedAt: "2026-04-18T10:00:00Z",
  staleAfter: null,
  supersededBy: null,
  bundleId: "bnd",
  ...over,
});

const mkGraph = (blocks: FlowBlock[]): FlowGraph => ({
  problemId: "p",
  blocks,
  cueCardMeta: { lastSyntheticAt: null, bodyHash: null, bodyBytes: 0, stale: false },
});

describe("VoiScorer", () => {
  const clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));

  test("기본 공식: severity=1, confidence=1 → 0.35 + 0.15 = 0.5", () => {
    const scorer = new VoiScorer();
    const subject = mkBlock({ blockId: "s", confidence: 1.0 });
    const gap = mkBlock({
      blockId: "g",
      type: "Gap",
      detectorId: "semantic",
      subject: { blockId: "s" },
      severity: 1.0,
      semanticBoost: 0,
    });
    const voi = scorer.score(gap, mkGraph([subject, gap]), clock);
    expect(voi).toBeCloseTo(0.5, 2);
  });

  test("subject 없는 경우 confidenceGap=0.5", () => {
    const scorer = new VoiScorer();
    const gap = mkBlock({
      blockId: "g",
      type: "Gap",
      detectorId: "semantic",
      subject: { blockId: "ghost" },
      severity: 0,
      semanticBoost: 0,
    });
    const voi = scorer.score(gap, mkGraph([gap]), clock);
    expect(voi).toBeCloseTo(0.225, 3);
  });

  test("recency clamp: 시계 역행 → 1.0", () => {
    const scorer = new VoiScorer();
    const future = new FakeClock(new Date("2026-04-17T10:00:00Z"));
    const subject = mkBlock({
      blockId: "s",
      confidence: 1.0,
      lastConfirmedAt: "2026-04-18T10:00:00Z",
    });
    const gap = mkBlock({
      blockId: "g",
      type: "Gap",
      detectorId: "semantic",
      subject: { blockId: "s" },
      severity: 0,
      semanticBoost: 0,
    });
    const voi = scorer.score(gap, mkGraph([subject, gap]), future);
    expect(voi).toBeGreaterThanOrEqual(0.14);
    expect(voi).toBeLessThanOrEqual(0.16);
  });

  test("centrality: 많이 연결된 subject일수록 높음", () => {
    const scorer = new VoiScorer();
    const subject = mkBlock({
      blockId: "s",
      relations: [
        { kind: "causes", targetBlockId: "x1", confidence: 0.5 },
        { kind: "causes", targetBlockId: "x2", confidence: 0.5 },
      ],
    });
    const gap = mkBlock({
      blockId: "g",
      type: "Gap",
      detectorId: "semantic",
      subject: { blockId: "s" },
      severity: 0,
      semanticBoost: 0,
    });
    const other1 = mkBlock({
      blockId: "o1",
      relations: [{ kind: "causes", targetBlockId: "s", confidence: 0.5 }],
    });
    const other2 = mkBlock({ blockId: "o2", relations: [] });
    const voi = scorer.score(gap, mkGraph([subject, gap, other1, other2]), clock);
    expect(voi).toBeGreaterThan(0.15);
  });

  test("semanticBoost 1.0 → VOI 0.15 상향", () => {
    const scorer = new VoiScorer();
    const subject = mkBlock({ blockId: "s", confidence: 1.0 });
    const base = mkBlock({
      blockId: "g1",
      type: "Gap",
      detectorId: "semantic",
      subject: { blockId: "s" },
      severity: 0,
      semanticBoost: 0,
    });
    const boosted = mkBlock({
      blockId: "g2",
      type: "Gap",
      detectorId: "semantic",
      subject: { blockId: "s" },
      severity: 0,
      semanticBoost: 1,
    });
    const graph = mkGraph([subject, base, boosted]);
    expect(scorer.score(boosted, graph, clock) - scorer.score(base, graph, clock)).toBeCloseTo(
      0.15,
      2,
    );
  });

  test("결과 범위 0~1 보장", () => {
    const scorer = new VoiScorer();
    const subject = mkBlock({ blockId: "s" });
    const gap = mkBlock({
      blockId: "g",
      type: "Gap",
      detectorId: "semantic",
      subject: { blockId: "s" },
      severity: 1.0,
      semanticBoost: 1.0,
    });
    const voi = scorer.score(gap, mkGraph([subject, gap]), clock);
    expect(voi).toBeGreaterThanOrEqual(0);
    expect(voi).toBeLessThanOrEqual(1);
  });
});
