import { describe, test, expect, beforeEach } from "bun:test";
import { LearningLedger } from "../../../src/core/learning/LearningLedger";
import { DetectorWeight } from "../../../src/core/learning/DetectorWeight";
import { ClaimStore } from "../../../src/core/claim/ClaimStore";
import { PromotionLedger } from "../../../src/core/identity/PromotionLedger";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";
import type { ClaimCandidate } from "../../../src/core/claim/types";
import type { PromotedCandidate } from "../../../src/core/identity/types";

function makeClaim(overrides: Partial<ClaimCandidate> = {}): ClaimCandidate {
  return {
    candidateId: "cc-1",
    bundleId: "b1",
    blockId: "blk-1",
    proposedType: "outcome",
    proposedText: "테스트",
    detectedBy: "outcome-rule",
    confidence: 0.9,
    evidence: [],
    status: "pending",
    createdAt: "2026-04-30T00:00:00Z",
    decidedAt: null,
    decidedBy: null,
    reason: null,
    ...overrides,
  };
}

function makePromoCandidate(overrides: Partial<PromotedCandidate> = {}): PromotedCandidate {
  return {
    candidateId: "pc-1",
    bundleId: "b1",
    proposedTarget: "tools",
    proposedLabel: "tool 사용 패턴",
    detectedBy: "high-tool-call-pattern",
    metrics: {},
    status: "pending",
    createdAt: "2026-04-30T00:00:00Z",
    decidedAt: null,
    decidedBy: null,
    reason: null,
    ...overrides,
  };
}

describe("ClaimStore × LearningLedger 자동 기록 (PR-V3.11)", () => {
  let ledger: LearningLedger;
  let store: ClaimStore;
  let weight: DetectorWeight;

  beforeEach(() => {
    const storage = new MemoryStorage();
    const clock = new FakeClock();
    ledger = new LearningLedger(storage, clock);
    store = new ClaimStore(storage, clock, ledger);
    weight = new DetectorWeight(ledger);
  });

  test("decide accept → learning ledger 에 decision 1건", async () => {
    await store.append(makeClaim({ candidateId: "c1" }));
    await store.decide("c1", "accepted");
    const events = await ledger.list({ ledger: "claim" });
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("decision");
  });

  test("decide reject → DetectorWeight 에 reject 카운트 반영", async () => {
    await store.append(makeClaim({ candidateId: "c2", detectedBy: "rule-Y" }));
    await store.decide("c2", "rejected");
    const s = await weight.getStats("rule-Y");
    expect(s.rejected).toBe(1);
    expect(s.accepted).toBe(0);
  });

  test("supersede → recordSupersede 자동 호출", async () => {
    await store.append(makeClaim({ candidateId: "old", status: "accepted", detectedBy: "rule-S" }));
    await store.supersede("old", makeClaim({ candidateId: "new", detectedBy: "rule-S" }));
    const s = await weight.getStats("rule-S");
    expect(s.superseded).toBe(1);
  });

  test("invalidate → recordInvalidate 자동 호출", async () => {
    await store.append(makeClaim({ candidateId: "iv", status: "accepted", detectedBy: "rule-I" }));
    await store.invalidate("iv", "metric 잘못 측정");
    const s = await weight.getStats("rule-I");
    expect(s.invalidated).toBe(1);
  });

  test("learningLedger 미주입 → 결정 정상 진행 + 기록 안 됨", async () => {
    const storage = new MemoryStorage();
    const clock = new FakeClock();
    const noLearnStore = new ClaimStore(storage, clock); // no learningLedger
    await noLearnStore.append(makeClaim({ candidateId: "x" }));
    await noLearnStore.decide("x", "accepted"); // 에러 없음
    const c = await noLearnStore.getById("x");
    expect(c!.status).toBe("accepted");
  });
});

describe("PromotionLedger × LearningLedger 자동 기록 (PR-V3.11)", () => {
  test("decide → learning ledger 에 promotion 이벤트", async () => {
    const storage = new MemoryStorage();
    const clock = new FakeClock();
    const learning = new LearningLedger(storage, clock);
    const promo = new PromotionLedger(storage, clock, learning);
    await promo.append(makePromoCandidate({ candidateId: "pc-x", detectedBy: "high-tool-call-pattern" }));
    await promo.decide("pc-x", "accepted");

    const events = await learning.list({ ledger: "promotion" });
    expect(events).toHaveLength(1);

    const weight = new DetectorWeight(learning);
    const stats = await weight.getStats("high-tool-call-pattern", { ledger: "promotion" });
    expect(stats.accepted).toBe(1);
  });
});
