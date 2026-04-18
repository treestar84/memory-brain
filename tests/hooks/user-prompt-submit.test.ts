import { describe, test, expect, beforeEach } from "bun:test";
import { handleUserPromptSubmit } from "../../src/hooks/user-prompt-submit";
import { MemoryStorage } from "../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../src/core/clock/Clock";
import { ActiveProblemStore } from "../../src/core/binder/ActiveProblemStore";
import { PendingQueue } from "../../src/core/ledger/PendingQueue";
import { RawLedger } from "../../src/core/ledger/RawLedger";
import { ObservationBundler } from "../../src/core/flow/ObservationBundler";
import type { CanonicalEvent } from "../../src/core/events/CanonicalEvent";

function makePromptSubmit(message = "Fix the bug"): CanonicalEvent {
  return {
    platform: "claude-code", stage: "prompt-submit", sessionId: "sess-001",
    cwd: "/project", timestampIso: "2026-04-17T10:00:00Z",
    payload: { stage: "prompt-submit", message },
    raw: {}, adapterVersion: "claude-code@1.0",
  };
}

describe("UserPromptSubmit hook", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let problemStore: ActiveProblemStore;
  let queue: PendingQueue;
  let ledger: RawLedger;
  let bundler: ObservationBundler;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-17T10:00:00Z"));
    problemStore = new ActiveProblemStore(storage, clock);
    queue = new PendingQueue(storage, clock);
    ledger = new RawLedger(storage, clock);
    bundler = new ObservationBundler(storage, clock);
  });

  test("appends to raw ledger", async () => {
    await handleUserPromptSubmit(makePromptSubmit(), {
      storage, clock, problemStore, queue, ledger, bundler,
    });
    const records = await storage.readJsonl("ledger/raw/2026/04/17/session-sess-001.jsonl");
    expect(records.length).toBe(1);
  });

  test("emits active problem summary", async () => {
    await problemStore.create("auth bug", "auth-bug");
    const output = await handleUserPromptSubmit(makePromptSubmit(), {
      storage, clock, problemStore, queue, ledger, bundler,
    });
    expect(output).toContain("auth bug");
  });

  test("emits null when no active problem", async () => {
    const output = await handleUserPromptSubmit(makePromptSubmit(), {
      storage, clock, problemStore, queue, ledger, bundler,
    });
    expect(output).toBeNull();
  });

  test("includes pending item hint when queue non-empty", async () => {
    await problemStore.create("test", "test");
    await queue.enqueue({ type: "user-intent", data: { message: "what about X?" } });
    const output = await handleUserPromptSubmit(makePromptSubmit(), {
      storage, clock, problemStore, queue, ledger, bundler,
    });
    expect(output).toContain("대기");
  });

  test("output is under 2KB", async () => {
    await problemStore.create("test problem", "test-problem");
    const output = await handleUserPromptSubmit(makePromptSubmit("a".repeat(500)), {
      storage, clock, problemStore, queue, ledger, bundler,
    });
    if (output) {
      expect(new TextEncoder().encode(output).length).toBeLessThanOrEqual(2048);
    }
  });

  test("opens first turn when no prior turn state exists", async () => {
    await problemStore.create("bug", "bug");
    await handleUserPromptSubmit(makePromptSubmit(), {
      storage, clock, problemStore, queue, ledger, bundler,
    });
    const state = await storage.readJson<any>("state/current-turn-sess-001.json");
    expect(state?.turnOrdinal).toBe(1);
    expect(state?.closed).toBeUndefined();
  });

  test("seals prior turn and opens next turn with incremented ordinal", async () => {
    await problemStore.create("bug", "bug");
    const active = (await problemStore.getActive())!;
    await bundler.openTurn("sess-001", active.id, 1);
    await queue.enqueue({ type: "tool:Edit", data: { filesTouched: ["a.ts"] } }, "sess-001");
    clock.advance(1000);

    await handleUserPromptSubmit(makePromptSubmit(), {
      storage, clock, problemStore, queue, ledger, bundler,
    });

    const state = await storage.readJson<any>("state/current-turn-sess-001.json");
    expect(state?.turnOrdinal).toBe(2);

    const unprocessed = await bundler.listUnprocessed();
    expect(unprocessed.length).toBe(1);
    expect(unprocessed[0].turnOrdinal).toBe(1);
    expect(unprocessed[0].observations).toHaveLength(1);

    expect(await queue.count()).toBe(0);
  });

  test("does not re-seal an already-closed turn", async () => {
    await problemStore.create("bug", "bug");
    const active = (await problemStore.getActive())!;
    await bundler.openTurn("sess-001", active.id, 1);
    await bundler.sealTurn("sess-001", [], []);
    clock.advance(1000);

    await handleUserPromptSubmit(makePromptSubmit(), {
      storage, clock, problemStore, queue, ledger, bundler,
    });

    const state = await storage.readJson<any>("state/current-turn-sess-001.json");
    expect(state?.turnOrdinal).toBe(2);
    const unprocessed = await bundler.listUnprocessed();
    expect(unprocessed).toHaveLength(1);
    expect(unprocessed[0].turnOrdinal).toBe(1);
  });
});
