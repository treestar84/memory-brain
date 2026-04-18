import { describe, test, expect } from "bun:test";
import { QuestionLifecycleResolver } from "../../../src/core/gap/QuestionLifecycleResolver";
import { FakeClock } from "../../../src/core/clock/Clock";
import type { FlowBlock } from "../../../src/core/flow/types";
import type { AskedRecord } from "../../../src/core/gap/types";

const mkQ = (over: Partial<FlowBlock> = {}): FlowBlock => ({
  blockId: "q1",
  problemId: "p",
  type: "Question",
  status: "confirmed",
  label: "?",
  confidence: 1,
  supportedBy: [],
  relations: [],
  createdAt: "2026-04-18T10:00:00Z",
  lastConfirmedAt: null,
  staleAfter: null,
  supersededBy: null,
  bundleId: "bnd",
  gapBlockId: "gap:semantic:s",
  ...over,
});

const mkGap = (over: Partial<FlowBlock>): FlowBlock =>
  mkQ({
    blockId: "gap:semantic:s",
    type: "Gap",
    detectorId: "semantic",
    subject: { blockId: "s" },
    severity: 0.5,
    ...over,
  });

describe("QuestionLifecycleResolver", () => {
  const clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));
  const resolver = new QuestionLifecycleResolver();

  test("answered: status=superseded + supersededBy 블록 존재", () => {
    const gap = mkGap({});
    const answer = mkQ({ blockId: "ans1", type: "Evidence", bundleId: "bnd_ans" });
    const question = mkQ({ status: "superseded", supersededBy: "ans1" });
    const result = resolver.resolve([question, answer, gap], [], clock);
    expect(result.get("q1")).toEqual({
      lifecycle: "answered",
      askedAt: null,
      answeredByBundleId: "bnd_ans",
      answerBlockId: "ans1",
    });
  });

  test("stale: gapBlockId가 graph에 없음", () => {
    const question = mkQ({ gapBlockId: "gap:ghost" });
    const result = resolver.resolve([question], [], clock);
    expect(result.get("q1")?.lifecycle).toBe("stale");
  });

  test("asked: asked.jsonl에 기록 있음", () => {
    const gap = mkGap({});
    const question = mkQ();
    const asked: AskedRecord[] = [
      {
        questionBlockId: "q1",
        gapBlockId: "gap:semantic:s",
        problemId: "p",
        askedAtIso: "2026-04-18T09:00:00Z",
        sessionId: "sess",
        promptTurnOrdinal: 3,
      },
    ];
    const result = resolver.resolve([question, gap], asked, clock);
    expect(result.get("q1")?.lifecycle).toBe("asked");
    expect(result.get("q1")?.askedAt).toBe("2026-04-18T09:00:00Z");
  });

  test("pending: gap 존재, asked 기록 없음", () => {
    const gap = mkGap({});
    const question = mkQ();
    const result = resolver.resolve([question, gap], [], clock);
    expect(result.get("q1")?.lifecycle).toBe("pending");
  });

  test("30일 pending 경과 → stale", () => {
    const gap = mkGap({});
    const oldQ = mkQ({ createdAt: "2026-03-01T00:00:00Z" });
    const result = resolver.resolve([oldQ, gap], [], clock);
    expect(result.get("q1")?.lifecycle).toBe("stale");
  });

  test("asked.jsonl 중복 → 가장 이른 askedAt 채택", () => {
    const gap = mkGap({});
    const question = mkQ();
    const asked: AskedRecord[] = [
      {
        questionBlockId: "q1",
        gapBlockId: "gap:semantic:s",
        problemId: "p",
        askedAtIso: "2026-04-18T09:00:00Z",
        sessionId: "s1",
        promptTurnOrdinal: 1,
      },
      {
        questionBlockId: "q1",
        gapBlockId: "gap:semantic:s",
        problemId: "p",
        askedAtIso: "2026-04-18T08:00:00Z",
        sessionId: "s2",
        promptTurnOrdinal: 2,
      },
    ];
    const result = resolver.resolve([question, gap], asked, clock);
    expect(result.get("q1")?.askedAt).toBe("2026-04-18T08:00:00Z");
  });
});
