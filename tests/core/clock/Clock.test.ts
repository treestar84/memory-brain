import { test, expect, describe } from "bun:test";
import { RealClock, FakeClock } from "../../../src/core/clock/Clock";

describe("Clock.isoDate (UTC 경계)", () => {
  test("FakeClock: isoNow 앞 10자가 isoDate", () => {
    const c = new FakeClock(new Date("2026-04-17T10:00:00Z"));
    expect(c.isoDate()).toBe("2026-04-17");
    expect(c.isoNow().slice(0, 10)).toBe(c.isoDate());
  });

  test("FakeClock: UTC 자정 경계 넘기면 isoDate 변경", () => {
    const c = new FakeClock(new Date("2026-04-17T23:59:59Z"));
    expect(c.isoDate()).toBe("2026-04-17");
    c.advance(2_000);
    expect(c.isoDate()).toBe("2026-04-18");
  });

  test("FakeClock: KST 입력도 UTC로 정규화되어 isoDate 산출", () => {
    const c = new FakeClock(new Date("2026-04-18T08:00:00+09:00"));
    expect(c.isoDate()).toBe("2026-04-17");
  });

  test("RealClock: isoDate는 10자 YYYY-MM-DD 형식", () => {
    const d = new RealClock().isoDate();
    expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
