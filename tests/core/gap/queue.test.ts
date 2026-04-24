import { describe, test, expect, beforeEach } from "bun:test";
import { QuestionQueue } from "../../../src/core/gap/QuestionQueue";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";
import type { FlowGraph, FlowBlock } from "../../../src/core/flow/types";

const mkBlock = (over: Partial<FlowBlock>): FlowBlock => ({
  blockId: "x",
  problemId: "p",
  type: "Gap",
  status: "confirmed",
  label: "x",
  confidence: 1,
  supportedBy: [],
  relations: [],
  createdAt: "2026-04-18T10:00:00Z",
  lastConfirmedAt: null,
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

describe("QuestionQueue", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let queue: QuestionQueue;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));
    queue = new QuestionQueue(storage, clock);
  });

  test("빈 graph → 빈 pending, 빈 current-gaps", async () => {
    await queue.rebuild(mkGraph([]));
    expect(await queue.listPending()).toEqual([]);
    expect((await queue.readCurrentGaps()).gaps).toEqual([]);
  });

  test("pending Question은 VOI 내림차순으로 정렬", async () => {
    const gap1 = mkBlock({
      blockId: "g1",
      detectorId: "semantic",
      subject: { blockId: "s1" },
      severity: 0.5,
      voiCached: 0.4,
    });
    const gap2 = mkBlock({
      blockId: "g2",
      detectorId: "semantic",
      subject: { blockId: "s2" },
      severity: 0.5,
      voiCached: 0.8,
    });
    const q1 = mkBlock({
      blockId: "q1",
      type: "Question",
      label: "Q1",
      gapBlockId: "g1",
      lifecycle: "pending",
      voiCached: 0.4,
    });
    const q2 = mkBlock({
      blockId: "q2",
      type: "Question",
      label: "Q2",
      gapBlockId: "g2",
      lifecycle: "pending",
      voiCached: 0.8,
    });
    await queue.rebuild(mkGraph([gap1, gap2, q1, q2]));
    const pending = await queue.listPending();
    expect(pending.map((p) => p.questionBlockId)).toEqual(["q2", "q1"]);
  });

  test("lifecycle!=pending인 Question은 pending에서 제외", async () => {
    const gap = mkBlock({
      blockId: "g1",
      detectorId: "semantic",
      subject: { blockId: "s" },
      severity: 0.5,
      voiCached: 0.5,
    });
    const asked = mkBlock({
      blockId: "q1",
      type: "Question",
      label: "asked",
      gapBlockId: "g1",
      lifecycle: "asked",
      voiCached: 0.5,
    });
    await queue.rebuild(mkGraph([gap, asked]));
    expect(await queue.listPending()).toEqual([]);
  });

  test("tie-break: VOI 동점 → createdAt 오름차순, blockId 오름차순", async () => {
    const gap = mkBlock({
      blockId: "g1",
      detectorId: "semantic",
      subject: { blockId: "s" },
      severity: 0.5,
      voiCached: 0.5,
    });
    const qA = mkBlock({
      blockId: "qA",
      type: "Question",
      label: "A",
      gapBlockId: "g1",
      lifecycle: "pending",
      voiCached: 0.5,
      createdAt: "2026-04-18T09:00:00Z",
    });
    const qB = mkBlock({
      blockId: "qB",
      type: "Question",
      label: "B",
      gapBlockId: "g1",
      lifecycle: "pending",
      voiCached: 0.5,
      createdAt: "2026-04-18T08:00:00Z",
    });
    await queue.rebuild(mkGraph([gap, qA, qB]));
    const pending = await queue.listPending();
    expect(pending.map((p) => p.questionBlockId)).toEqual(["qB", "qA"]);
  });

  test("current-gaps에 hasQuestion·questionBlockId 반영", async () => {
    const gap = mkBlock({
      blockId: "g1",
      detectorId: "semantic",
      subject: { blockId: "s" },
      severity: 0.5,
      voiCached: 0.5,
    });
    const q = mkBlock({
      blockId: "q1",
      type: "Question",
      label: "?",
      gapBlockId: "g1",
      lifecycle: "pending",
      voiCached: 0.5,
    });
    await queue.rebuild(mkGraph([gap, q]));
    const snap = await queue.readCurrentGaps();
    expect(snap.gaps[0].hasQuestion).toBe(true);
    expect(snap.gaps[0].questionBlockId).toBe("q1");
  });

  test("appendAsked / listAsked", async () => {
    await queue.appendAsked({
      questionBlockId: "q1",
      gapBlockId: "g1",
      problemId: "p",
      askedAtIso: "2026-04-18T10:00:00Z",
      sessionId: "s",
      promptTurnOrdinal: 1,
    });
    const asked = await queue.listAsked();
    expect(asked).toHaveLength(1);
    expect(asked[0].questionBlockId).toBe("q1");
  });

  test("resolveAsked: 미해결 asked에 resolution 추가 레코드 append", async () => {
    await queue.appendAsked({
      questionBlockId: "q1",
      gapBlockId: "g1",
      problemId: "p",
      askedAtIso: "2026-04-18T10:00:00Z",
      sessionId: "s",
      promptTurnOrdinal: 1,
    });
    clock.advance(60_000);
    const rec = await queue.resolveAsked("q1", "unknown");
    expect(rec?.resolution).toBe("unknown");
    expect(rec?.resolvedAtIso).toBe(clock.isoNow());
    const asked = await queue.listAsked();
    expect(asked).toHaveLength(2);
    expect(asked[1].resolution).toBe("unknown");
    expect(asked[1].gapBlockId).toBe("g1");
  });

  test("resolveAsked: 매칭되는 asked 없으면 null", async () => {
    const rec = await queue.resolveAsked("nonexistent", "unknown");
    expect(rec).toBeNull();
  });

  test("resolveAsked: 이미 resolved된 레코드는 스킵하고 다음 오픈 레코드 해소", async () => {
    await queue.appendAsked({
      questionBlockId: "q1",
      gapBlockId: "g1",
      problemId: "p",
      askedAtIso: "2026-04-18T10:00:00Z",
      sessionId: "s",
      promptTurnOrdinal: 1,
    });
    await queue.resolveAsked("q1", "unknown");
    const repeat = await queue.resolveAsked("q1", "answered");
    expect(repeat).toBeNull();
  });

  test("rebuild은 기존 pending 덮어씀", async () => {
    const gap = mkBlock({
      blockId: "g1",
      detectorId: "semantic",
      subject: { blockId: "s" },
      severity: 0.5,
      voiCached: 0.5,
    });
    const q1 = mkBlock({
      blockId: "q1",
      type: "Question",
      label: "old",
      gapBlockId: "g1",
      lifecycle: "pending",
      voiCached: 0.5,
    });
    await queue.rebuild(mkGraph([gap, q1]));
    expect(await queue.listPending()).toHaveLength(1);

    await queue.rebuild(mkGraph([]));
    expect(await queue.listPending()).toEqual([]);
  });
});
