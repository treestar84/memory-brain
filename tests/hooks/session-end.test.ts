import { describe, test, expect, beforeEach } from "bun:test";
import { handleSessionEnd } from "../../src/hooks/session-end";
import { MemoryStorage } from "../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../src/core/clock/Clock";
import { ActiveProblemStore } from "../../src/core/binder/ActiveProblemStore";
import { RawLedger } from "../../src/core/ledger/RawLedger";
import { PendingQueue } from "../../src/core/ledger/PendingQueue";
import { ObservationBundler } from "../../src/core/flow/ObservationBundler";
import { PromotionLedger } from "../../src/core/identity/PromotionLedger";
import { CandidateDetector } from "../../src/core/identity/CandidateDetector";
import type { CanonicalEvent } from "../../src/core/events/CanonicalEvent";

function makeSessionEnd(): CanonicalEvent {
  return {
    platform: "claude-code", stage: "session-end", sessionId: "sess-001",
    cwd: "/project", timestampIso: "2026-04-17T11:00:00Z",
    payload: { stage: "session-end" },
    raw: {}, adapterVersion: "claude-code@1.0",
  };
}

describe("SessionEnd hook", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let problemStore: ActiveProblemStore;
  let ledger: RawLedger;
  let queue: PendingQueue;
  let bundler: ObservationBundler;
  let promotionLedger: PromotionLedger;
  let candidateDetector: CandidateDetector;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-17T11:00:00Z"));
    problemStore = new ActiveProblemStore(storage, clock);
    ledger = new RawLedger(storage, clock);
    queue = new PendingQueue(storage, clock);
    bundler = new ObservationBundler(storage, clock);
    promotionLedger = new PromotionLedger(storage, clock);
    candidateDetector = new CandidateDetector(clock);
  });

  test("appends session-end to raw ledger", async () => {
    await handleSessionEnd(makeSessionEnd(), { storage, clock, problemStore, ledger, queue, bundler, promotionLedger, candidateDetector });
    const records = await storage.readJsonl("ledger/raw/2026/04/17/session-sess-001.jsonl");
    expect(records.length).toBe(1);
  });

  test("updates lastConfirmedAt on active problem", async () => {
    await problemStore.create("test", "test");
    clock.advance(60_000);
    await handleSessionEnd(makeSessionEnd(), { storage, clock, problemStore, ledger, queue, bundler, promotionLedger, candidateDetector });
    const active = await problemStore.getActive();
    expect(active?.lastConfirmedAt).toBe(clock.isoNow());
  });

  test("safe when no active problem", async () => {
    const output = await handleSessionEnd(makeSessionEnd(), { storage, clock, problemStore, ledger, queue, bundler, promotionLedger, candidateDetector });
    expect(output).toBeNull();
  });

  test("idempotent — calling twice is safe", async () => {
    await problemStore.create("test", "test");
    await handleSessionEnd(makeSessionEnd(), { storage, clock, problemStore, ledger, queue, bundler, promotionLedger, candidateDetector });
    await handleSessionEnd(makeSessionEnd(), { storage, clock, problemStore, ledger, queue, bundler, promotionLedger, candidateDetector });
    const records = await storage.readJsonl("ledger/raw/2026/04/17/session-sess-001.jsonl");
    expect(records.length).toBe(2);
  });

  test("returns null (no stdout output)", async () => {
    const output = await handleSessionEnd(makeSessionEnd(), { storage, clock, problemStore, ledger, queue, bundler, promotionLedger, candidateDetector });
    expect(output).toBeNull();
  });

  test("seals the currently open turn into a bundle", async () => {
    await problemStore.create("bug", "bug");
    const active = (await problemStore.getActive())!;
    await bundler.openTurn("sess-001", active.id, 1);
    await queue.enqueue({ type: "tool:Bash", data: { exitCode: 0 } }, "sess-001");

    await handleSessionEnd(makeSessionEnd(), { storage, clock, problemStore, ledger, queue, bundler, promotionLedger, candidateDetector });

    const unprocessed = await bundler.listUnprocessed();
    expect(unprocessed).toHaveLength(1);
    expect(unprocessed[0].turnOrdinal).toBe(1);
    expect(unprocessed[0].observations).toHaveLength(1);
    expect(await queue.count()).toBe(0);
  });

  test("no-op when no turn is open", async () => {
    const out = await handleSessionEnd(makeSessionEnd(), { storage, clock, problemStore, ledger, queue, bundler, promotionLedger, candidateDetector });
    expect(out).toBeNull();
    const unprocessed = await bundler.listUnprocessed();
    expect(unprocessed).toHaveLength(0);
  });
});
