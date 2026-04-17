import { describe, test, expect, beforeEach } from "bun:test";
import { handleSessionStart } from "../../src/hooks/session-start";
import { MemoryStorage } from "../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../src/core/clock/Clock";
import { ActiveProblemStore } from "../../src/core/binder/ActiveProblemStore";
import { PendingQueue } from "../../src/core/ledger/PendingQueue";
import { RawLedger } from "../../src/core/ledger/RawLedger";
import { Expirer } from "../../src/core/ledger/Expirer";
import type { CanonicalEvent } from "../../src/core/events/CanonicalEvent";

function makeSessionStart(sessionId = "sess-001"): CanonicalEvent {
  return {
    platform: "claude-code", stage: "session-start", sessionId, cwd: "/project",
    timestampIso: "2026-04-17T10:00:00Z", payload: { stage: "session-start" },
    raw: {}, adapterVersion: "claude-code@1.0",
  };
}

describe("SessionStart hook", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let problemStore: ActiveProblemStore;
  let queue: PendingQueue;
  let ledger: RawLedger;
  let expirer: Expirer;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-17T10:00:00Z"));
    problemStore = new ActiveProblemStore(storage, clock);
    queue = new PendingQueue(storage, clock);
    ledger = new RawLedger(storage, clock);
    expirer = new Expirer(storage, clock, 7);
  });

  test("emits init message on empty state", async () => {
    const output = await handleSessionStart(makeSessionStart(), {
      storage, clock, problemStore, queue, ledger, expirer,
    });
    expect(output).toContain("memory-brain");
    expect(output).toContain("초기화");
  });

  test("emits active problem summary when exists", async () => {
    await problemStore.create("fix auth bug", "fix-auth");
    const output = await handleSessionStart(makeSessionStart(), {
      storage, clock, problemStore, queue, ledger, expirer,
    });
    expect(output).toContain("fix auth bug");
  });

  test("includes pending queue count", async () => {
    await queue.enqueue({ type: "test", data: {} });
    await queue.enqueue({ type: "test2", data: {} });
    const output = await handleSessionStart(makeSessionStart(), {
      storage, clock, problemStore, queue, ledger, expirer,
    });
    expect(output).toContain("2");
  });

  test("runs expirer sweep on startup", async () => {
    await queue.enqueue({ type: "old", data: {} });
    clock.advance(8 * 24 * 60 * 60 * 1000);
    await handleSessionStart(makeSessionStart(), {
      storage, clock, problemStore, queue, ledger, expirer,
    });
    expect(await queue.count()).toBe(0);
  });

  test("appends to raw ledger", async () => {
    await handleSessionStart(makeSessionStart(), {
      storage, clock, problemStore, queue, ledger, expirer,
    });
    const records = await storage.readJsonl("ledger/raw/2026/04/17/session-sess-001.jsonl");
    expect(records.length).toBe(1);
  });

  test("output is under 2KB", async () => {
    await problemStore.create("test problem", "test-problem");
    for (let i = 0; i < 10; i++) {
      await queue.enqueue({ type: `item-${i}`, data: {} });
    }
    const output = await handleSessionStart(makeSessionStart(), {
      storage, clock, problemStore, queue, ledger, expirer,
    });
    expect(new TextEncoder().encode(output).length).toBeLessThanOrEqual(2048);
  });
});
