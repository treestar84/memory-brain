import { describe, test, expect, beforeEach } from "bun:test";
import { Expirer } from "../../../src/core/ledger/Expirer";
import { PendingQueue } from "../../../src/core/ledger/PendingQueue";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";

describe("Expirer", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let queue: PendingQueue;
  let expirer: Expirer;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-17T10:00:00Z"));
    queue = new PendingQueue(storage, clock);
    expirer = new Expirer(storage, clock, 7);
  });

  test("does nothing when queue is empty", async () => {
    const expired = await expirer.sweep(queue);
    expect(expired).toBe(0);
  });

  test("does not expire items within TTL", async () => {
    await queue.enqueue({ type: "recent", data: {} });
    clock.advance(6 * 24 * 60 * 60 * 1000);
    const expired = await expirer.sweep(queue);
    expect(expired).toBe(0);
    expect(await queue.count()).toBe(1);
  });

  test("expires items past TTL", async () => {
    await queue.enqueue({ type: "old", data: {} });
    clock.advance(8 * 24 * 60 * 60 * 1000);
    const expired = await expirer.sweep(queue);
    expect(expired).toBe(1);
    expect(await queue.count()).toBe(0);
  });

  test("moves expired items to expired-analysis.jsonl", async () => {
    await queue.enqueue({ type: "old", data: {} });
    clock.advance(8 * 24 * 60 * 60 * 1000);
    await expirer.sweep(queue);
    const archived = await storage.readJsonl<{ payload: { type: string } }>("ledger/expired-analysis.jsonl");
    expect(archived.length).toBe(1);
    expect(archived[0].payload.type).toBe("old");
  });

  test("mixed: expires old, keeps recent", async () => {
    await queue.enqueue({ type: "old-1", data: {} });
    clock.advance(5 * 24 * 60 * 60 * 1000);
    await queue.enqueue({ type: "recent", data: {} });
    clock.advance(3 * 24 * 60 * 60 * 1000);
    const expired = await expirer.sweep(queue);
    expect(expired).toBe(1);
    const remaining = await queue.list();
    expect(remaining.length).toBe(1);
    expect(remaining[0].payload.type).toBe("recent");
  });

  test("raw ledger is not affected by expiration", async () => {
    await storage.appendJsonl("ledger/raw/2026/04/17/session-test.jsonl", { preserved: true });
    await queue.enqueue({ type: "old", data: {} });
    clock.advance(8 * 24 * 60 * 60 * 1000);
    await expirer.sweep(queue);
    const raw = await storage.readJsonl("ledger/raw/2026/04/17/session-test.jsonl");
    expect(raw.length).toBe(1);
  });
});
