import { describe, test, expect, beforeEach } from "bun:test";
import { handleSessionStart } from "../../src/hooks/session-start";
import { MemoryStorage } from "../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../src/core/clock/Clock";
import { ActiveProblemStore } from "../../src/core/binder/ActiveProblemStore";
import { PendingQueue } from "../../src/core/ledger/PendingQueue";
import { RawLedger } from "../../src/core/ledger/RawLedger";
import { Expirer } from "../../src/core/ledger/Expirer";
import { ObservationBundler } from "../../src/core/flow/ObservationBundler";
import { CueCardInjector } from "../../src/core/flow/CueCardInjector";
import { CueCardFallback } from "../../src/core/flow/CueCardFallback";
import { PromotionLedger } from "../../src/core/identity/PromotionLedger";
import type { PromotedCandidate } from "../../src/core/identity/types";
import type { CanonicalEvent } from "../../src/core/events/CanonicalEvent";

function makeSessionStart(): CanonicalEvent {
  return {
    platform: "claude-code", stage: "session-start", sessionId: "sess-promo-001",
    cwd: "/project", timestampIso: "2026-04-26T10:00:00Z",
    payload: { stage: "session-start" }, raw: {}, adapterVersion: "claude-code@1.0",
  };
}

function makeCandidate(i: number): PromotedCandidate {
  return {
    candidateId: `cand-${i}`,
    bundleId: `bnd-${i}`,
    proposedTarget: "tools",
    proposedLabel: `tool 사용 패턴: tool-${i} (5회)`,
    detectedBy: "high-tool-call-pattern",
    metrics: { toolCallCount: 5 },
    status: "pending",
    createdAt: "2026-04-26T00:00:00Z",
    decidedAt: null,
    decidedBy: null,
    reason: null,
  };
}

describe("SessionStart → Promotion nudge", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let promotionLedger: PromotionLedger;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-26T10:00:00Z"));
    promotionLedger = new PromotionLedger(storage, clock);
  });

  const baseDeps = () => ({
    storage, clock,
    problemStore: new ActiveProblemStore(storage, clock),
    queue: new PendingQueue(storage, clock),
    ledger: new RawLedger(storage, clock),
    expirer: new Expirer(storage, clock, 7),
    bundler: new ObservationBundler(storage, clock),
    injector: new CueCardInjector(),
    fallback: new CueCardFallback(),
    promotionLedger,
  });

  test("pending < 5 → nudge 미발생", async () => {
    for (let i = 0; i < 4; i++) await promotionLedger.append(makeCandidate(i));
    const output = await handleSessionStart(makeSessionStart(), baseDeps());
    expect(output).not.toContain("promotion pending");
  });

  test("pending ≥ 5 → stdout context에 nudge 라인 포함", async () => {
    for (let i = 0; i < 5; i++) await promotionLedger.append(makeCandidate(i));
    const output = await handleSessionStart(makeSessionStart(), baseDeps());
    expect(output).toContain("promotion pending");
    expect(output).toContain("5건");
    expect(output).toContain("/cfgm-promote");
  });
});
