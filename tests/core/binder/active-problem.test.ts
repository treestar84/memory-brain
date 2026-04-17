import { describe, test, expect, beforeEach } from "bun:test";
import { ActiveProblemStore, type Problem } from "../../../src/core/binder/ActiveProblemStore";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";

describe("ActiveProblemStore", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let store: ActiveProblemStore;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-17T10:00:00Z"));
    store = new ActiveProblemStore(storage, clock);
  });

  test("getActive returns null when no problem exists", async () => {
    expect(await store.getActive()).toBeNull();
  });

  test("create sets new active problem", async () => {
    const p = await store.create("fix auth bug", "fix-auth-bug");
    expect(p.id).toMatch(/^prob-/);
    expect(p.slug).toBe("fix-auth-bug");
    expect(p.title).toBe("fix auth bug");
    const active = await store.getActive();
    expect(active?.id).toBe(p.id);
  });

  test("switch changes active problem", async () => {
    const p1 = await store.create("problem 1", "prob-1");
    const p2 = await store.create("problem 2", "prob-2");
    expect((await store.getActive())?.id).toBe(p2.id);
    await store.switchTo(p1.id);
    expect((await store.getActive())?.id).toBe(p1.id);
  });

  test("switch to nonexistent throws", async () => {
    expect(store.switchTo("prob-nonexistent")).rejects.toThrow();
  });

  test("updateLastConfirmed updates timestamp", async () => {
    await store.create("test", "test");
    clock.advance(60_000);
    await store.updateLastConfirmed();
    const active = await store.getActive();
    expect(active?.lastConfirmedAt).toBe(clock.isoNow());
  });

  test("getHistory returns all problems", async () => {
    await store.create("p1", "p1");
    await store.create("p2", "p2");
    await store.create("p3", "p3");
    const history = await store.getHistory();
    expect(history.length).toBe(3);
  });

  test("getSummary returns markdown string", async () => {
    await store.create("fix login", "fix-login");
    const summary = await store.getSummary();
    expect(summary).toContain("fix login");
  });

  test("getSummary returns empty message when no active", async () => {
    const summary = await store.getSummary();
    expect(summary).toContain("활성 문제 없음");
  });
});
