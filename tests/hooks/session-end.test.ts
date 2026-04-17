import { describe, test, expect, beforeEach } from "bun:test";
import { handleSessionEnd } from "../../src/hooks/session-end";
import { MemoryStorage } from "../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../src/core/clock/Clock";
import { ActiveProblemStore } from "../../src/core/binder/ActiveProblemStore";
import { RawLedger } from "../../src/core/ledger/RawLedger";
import { PendingQueue } from "../../src/core/ledger/PendingQueue";
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

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-17T11:00:00Z"));
    problemStore = new ActiveProblemStore(storage, clock);
    ledger = new RawLedger(storage, clock);
    queue = new PendingQueue(storage, clock);
  });

  test("appends session-end to raw ledger", async () => {
    await handleSessionEnd(makeSessionEnd(), { storage, clock, problemStore, ledger, queue });
    const records = await storage.readJsonl("ledger/raw/2026/04/17/session-sess-001.jsonl");
    expect(records.length).toBe(1);
  });

  test("updates lastConfirmedAt on active problem", async () => {
    await problemStore.create("test", "test");
    clock.advance(60_000);
    await handleSessionEnd(makeSessionEnd(), { storage, clock, problemStore, ledger, queue });
    const active = await problemStore.getActive();
    expect(active?.lastConfirmedAt).toBe(clock.isoNow());
  });

  test("safe when no active problem", async () => {
    const output = await handleSessionEnd(makeSessionEnd(), { storage, clock, problemStore, ledger, queue });
    expect(output).toBeNull();
  });

  test("idempotent — calling twice is safe", async () => {
    await problemStore.create("test", "test");
    await handleSessionEnd(makeSessionEnd(), { storage, clock, problemStore, ledger, queue });
    await handleSessionEnd(makeSessionEnd(), { storage, clock, problemStore, ledger, queue });
    const records = await storage.readJsonl("ledger/raw/2026/04/17/session-sess-001.jsonl");
    expect(records.length).toBe(2);
  });

  test("returns null (no stdout output)", async () => {
    const output = await handleSessionEnd(makeSessionEnd(), { storage, clock, problemStore, ledger, queue });
    expect(output).toBeNull();
  });
});
