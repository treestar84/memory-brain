import { describe, test, expect, beforeEach } from "bun:test";
import { PendingQueue } from "../../../src/core/ledger/PendingQueue";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";

describe("PendingQueue", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let queue: PendingQueue;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-17T10:00:00Z"));
    queue = new PendingQueue(storage, clock);
  });

  test("enqueue adds item to pending-analysis.jsonl", async () => {
    await queue.enqueue({ type: "user-intent", data: { message: "fix bug" } });
    const items = await queue.list();
    expect(items.length).toBe(1);
    expect(items[0].payload.type).toBe("user-intent");
  });

  test("enqueue assigns unique id and timestamp", async () => {
    await queue.enqueue({ type: "test", data: {} });
    const items = await queue.list();
    expect(items[0].id).toBeDefined();
    expect(items[0].enqueuedAt).toBe("2026-04-17T10:00:00.000Z");
  });

  test("multiple items append in order", async () => {
    await queue.enqueue({ type: "a", data: {} });
    clock.advance(1000);
    await queue.enqueue({ type: "b", data: {} });
    const items = await queue.list();
    expect(items.length).toBe(2);
    expect(items[0].payload.type).toBe("a");
    expect(items[1].payload.type).toBe("b");
  });

  test("dequeue removes item by id", async () => {
    await queue.enqueue({ type: "a", data: {} });
    await queue.enqueue({ type: "b", data: {} });
    const items = await queue.list();
    await queue.dequeue(items[0].id);
    const remaining = await queue.list();
    expect(remaining.length).toBe(1);
    expect(remaining[0].payload.type).toBe("b");
  });

  test("count returns number of items", async () => {
    expect(await queue.count()).toBe(0);
    await queue.enqueue({ type: "a", data: {} });
    await queue.enqueue({ type: "b", data: {} });
    expect(await queue.count()).toBe(2);
  });

  test("peek returns oldest item without removing", async () => {
    await queue.enqueue({ type: "first", data: {} });
    await queue.enqueue({ type: "second", data: {} });
    const item = await queue.peek();
    expect(item?.payload.type).toBe("first");
    expect(await queue.count()).toBe(2);
  });

  test("peek returns null when empty", async () => {
    expect(await queue.peek()).toBeNull();
  });

  test("enqueue persists sessionId and drainForSession returns and removes only that session's items", async () => {
    const a = await queue.enqueue({ type: "t", data: {} }, "sessA");
    const b = await queue.enqueue({ type: "t", data: {} }, "sessB");
    const c = await queue.enqueue({ type: "t", data: {} }, "sessA");
    const drained = await queue.drainForSession("sessA");
    expect(drained.map(i => i.id).sort()).toEqual([a.id, c.id].sort());
    const remaining = await queue.list();
    expect(remaining.map(i => i.id)).toEqual([b.id]);
  });

  test("enqueue without sessionId stores undefined and drainForSession skips those", async () => {
    await queue.enqueue({ type: "t", data: {} });
    const drained = await queue.drainForSession("sessA");
    expect(drained).toEqual([]);
    expect(await queue.count()).toBe(1);
  });
});
