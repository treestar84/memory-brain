import { describe, test, expect, beforeEach } from "bun:test";
import { LearningLedger } from "../../../src/core/learning/LearningLedger";
import { DetectorWeight } from "../../../src/core/learning/DetectorWeight";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";

describe("LearningLedger", () => {
  let ledger: LearningLedger;

  beforeEach(() => {
    ledger = new LearningLedger(new MemoryStorage(), new FakeClock());
  });

  test("recordDecision append → list 1건", async () => {
    await ledger.recordDecision({
      ledger: "claim",
      candidateId: "c1",
      detectorId: "rule-x",
      decision: "accepted",
      decidedBy: "user",
      reason: null,
    });
    const all = await ledger.list();
    expect(all).toHaveLength(1);
    expect(all[0]!.type).toBe("decision");
  });

  test("list filter — type / ledger", async () => {
    await ledger.recordDecision({
      ledger: "claim",
      candidateId: "c1",
      detectorId: "r",
      decision: "accepted",
      decidedBy: "user",
      reason: null,
    });
    await ledger.recordDecision({
      ledger: "promotion",
      candidateId: "p1",
      detectorId: "r",
      decision: "rejected",
      decidedBy: "user",
      reason: null,
    });
    expect(await ledger.list({ ledger: "claim" })).toHaveLength(1);
    expect(await ledger.list({ ledger: "promotion" })).toHaveLength(1);
    expect(await ledger.list({ type: "decision" })).toHaveLength(2);
  });

  test("recordSupersede + recordInvalidate", async () => {
    await ledger.recordSupersede({
      ledger: "claim",
      prevId: "old",
      newId: "new",
      detectorId: "r",
    });
    await ledger.recordInvalidate({
      ledger: "claim",
      candidateId: "c1",
      detectorId: "r",
      reason: "metric 잘못 측정",
    });
    expect(await ledger.list({ type: "supersede" })).toHaveLength(1);
    expect(await ledger.list({ type: "invalidate" })).toHaveLength(1);
  });
});

describe("DetectorWeight", () => {
  let ledger: LearningLedger;
  let weight: DetectorWeight;

  beforeEach(() => {
    ledger = new LearningLedger(new MemoryStorage(), new FakeClock());
    weight = new DetectorWeight(ledger);
  });

  test("관측 0건 → weight = 0.5 (prior α=β=2 중립)", async () => {
    const s = await weight.getStats("nope");
    expect(s.weight).toBe(0.5);
    expect(s.accepted).toBe(0);
    expect(s.rejected).toBe(0);
    expect(s.total).toBe(0);
    expect(s.rawAcceptRate).toBe(0);
  });

  test("3 accept / 0 reject → weight ≈ (3+2)/(3+0+2+2) = 5/7 ≈ 0.714", async () => {
    for (let i = 0; i < 3; i += 1) {
      await ledger.recordDecision({
        ledger: "claim",
        candidateId: `c${i}`,
        detectorId: "rule-A",
        decision: "accepted",
        decidedBy: "user",
        reason: null,
      });
    }
    const s = await weight.getStats("rule-A");
    expect(s.accepted).toBe(3);
    expect(s.rejected).toBe(0);
    expect(s.weight).toBeCloseTo(5 / 7, 3);
    expect(s.rawAcceptRate).toBe(1);
  });

  test("0 accept / 5 reject → weight ≈ (0+2)/(5+2+2) = 2/9 ≈ 0.222", async () => {
    for (let i = 0; i < 5; i += 1) {
      await ledger.recordDecision({
        ledger: "claim",
        candidateId: `c${i}`,
        detectorId: "rule-B",
        decision: "rejected",
        decidedBy: "user",
        reason: null,
      });
    }
    const s = await weight.getStats("rule-B");
    expect(s.weight).toBeCloseTo(2 / 9, 3);
  });

  test("supersede + invalidate 카운트", async () => {
    await ledger.recordSupersede({ ledger: "claim", prevId: "p", newId: "n", detectorId: "rule-C" });
    await ledger.recordInvalidate({ ledger: "claim", candidateId: "c", detectorId: "rule-C", reason: "x" });
    const s = await weight.getStats("rule-C");
    expect(s.superseded).toBe(1);
    expect(s.invalidated).toBe(1);
  });

  test("getAllStats — weight 낮은 순 정렬", async () => {
    // rule-low: 5 reject → weight ~ 0.22
    for (let i = 0; i < 5; i += 1) {
      await ledger.recordDecision({
        ledger: "claim", candidateId: `l${i}`, detectorId: "rule-low",
        decision: "rejected", decidedBy: null, reason: null,
      });
    }
    // rule-high: 5 accept → weight ~ 0.78
    for (let i = 0; i < 5; i += 1) {
      await ledger.recordDecision({
        ledger: "claim", candidateId: `h${i}`, detectorId: "rule-high",
        decision: "accepted", decidedBy: null, reason: null,
      });
    }

    const stats = await weight.getAllStats();
    expect(stats).toHaveLength(2);
    expect(stats[0]!.detectorId).toBe("rule-low");
    expect(stats[1]!.detectorId).toBe("rule-high");
  });

  test("ledger 필터 — claim 만 vs promotion 만", async () => {
    await ledger.recordDecision({
      ledger: "claim", candidateId: "c", detectorId: "rule-X",
      decision: "accepted", decidedBy: null, reason: null,
    });
    await ledger.recordDecision({
      ledger: "promotion", candidateId: "p", detectorId: "rule-X",
      decision: "rejected", decidedBy: null, reason: null,
    });

    const claimStats = await weight.getStats("rule-X", { ledger: "claim" });
    expect(claimStats.accepted).toBe(1);
    expect(claimStats.rejected).toBe(0);

    const promoStats = await weight.getStats("rule-X", { ledger: "promotion" });
    expect(promoStats.accepted).toBe(0);
    expect(promoStats.rejected).toBe(1);
  });
});
