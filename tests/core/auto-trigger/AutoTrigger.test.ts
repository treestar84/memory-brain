import { describe, test, expect, beforeEach } from "bun:test";
import {
  AutoTrigger,
  KNOWN_TRIGGERS,
  DEFAULT_TRIGGER_INTERVAL_MS,
} from "../../../src/core/auto-trigger/AutoTrigger";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";

describe("AutoTrigger", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let trigger: AutoTrigger;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-28T10:00:00Z"));
    trigger = new AutoTrigger(storage, clock);
  });

  test("shouldRun — lastRun 없으면 true", async () => {
    expect(await trigger.shouldRun("governance")).toBe(true);
  });

  test("markRun + shouldRun — interval 미달 시 false", async () => {
    await trigger.markRun("governance");
    clock.advance(60 * 60 * 1000); // 1시간
    expect(await trigger.shouldRun("governance")).toBe(false);
  });

  test("markRun + shouldRun — interval 초과 시 true", async () => {
    await trigger.markRun("governance");
    clock.advance(DEFAULT_TRIGGER_INTERVAL_MS + 1000);
    expect(await trigger.shouldRun("governance")).toBe(true);
  });

  test("custom intervalMs", async () => {
    await trigger.markRun("governance");
    expect(await trigger.shouldRun("governance", 1000)).toBe(false);
    clock.advance(2000);
    expect(await trigger.shouldRun("governance", 1000)).toBe(true);
  });

  test("getNudges — 초기 (lastRun 0건) → 모든 KNOWN_TRIGGERS nudge", async () => {
    const nudges = await trigger.getNudges();
    expect(nudges).toHaveLength(KNOWN_TRIGGERS.length);
    expect(nudges[0]).toContain("governance");
  });

  test("getNudges — markRun 후 해당 trigger 빠짐", async () => {
    await trigger.markRun("governance");
    const nudges = await trigger.getNudges();
    // governance 만 빠지고 search-index 는 남음
    expect(nudges).toHaveLength(KNOWN_TRIGGERS.length - 1);
    expect(nudges.some((n) => n.includes("governance"))).toBe(false);
    expect(nudges.some((n) => n.includes("search index"))).toBe(true);
  });

  test("getLastRun — 미실행 → null", async () => {
    expect(await trigger.getLastRun("governance")).toBeNull();
  });

  test("getLastRun — markRun 후 ISO 시점 반환", async () => {
    await trigger.markRun("governance");
    const last = await trigger.getLastRun("governance");
    expect(last).toBe("2026-04-28T10:00:00.000Z");
  });

  test("두 trigger 독립 — 한 쪽 markRun 이 다른 쪽에 영향 없음", async () => {
    await trigger.markRun("governance");
    expect(await trigger.shouldRun("governance")).toBe(false);
    expect(await trigger.shouldRun("search-index")).toBe(true);
  });

  test("storage 손상 (잘못된 형식) → 기본값으로 회복", async () => {
    await storage.writeJsonAtomic("state/auto-trigger.json", { weird: "data" });
    expect(await trigger.shouldRun("governance")).toBe(true);
    expect(await trigger.getLastRun("governance")).toBeNull();
  });
});
