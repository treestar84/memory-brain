import { describe, test, expect } from "bun:test";
import {
  SessionStartBudget,
  SESSION_START_TOTAL_BUDGET_BYTES,
} from "../../../src/core/context-budget/SessionStartBudget";

describe("SessionStartBudget", () => {
  test("limit 안에 들어가면 그대로 반환", () => {
    const budget = new SessionStartBudget(1000);
    const lines = ["# header", "body line 1", "body line 2"];
    const r = budget.enforce(lines);
    expect(r.truncated).toBe(false);
    expect(r.lines).toEqual(lines);
    expect(r.droppedLines).toBe(0);
  });

  test("limit 초과 → 끝에서부터 drop + truncation 알림 추가", () => {
    // 알림 라인 자체가 ~80~100B (한국어+이모지 UTF-8) 이라 limit 은 그보다 충분히 커야 의미.
    const budget = new SessionStartBudget(300);
    const lines = Array.from({ length: 30 }, (_, i) => `line ${i} - some content here`);
    const r = budget.enforce(lines);
    expect(r.truncated).toBe(true);
    expect(r.droppedLines).toBeGreaterThan(0);
    expect(r.usedBytes).toBeLessThanOrEqual(300);
    expect(r.lines.at(-1)).toContain("⚠️");
    expect(r.lines.at(-1)).toContain("300B");
  });

  test("originalBytes 보고 정확", () => {
    const budget = new SessionStartBudget(20);
    const lines = ["aaaaaaaaaa", "bbbbbbbbbb", "cccccccccc"]; // 32 bytes (10+1+10+1+10)
    const r = budget.enforce(lines);
    expect(r.originalBytes).toBe(32);
    expect(r.truncated).toBe(true);
  });

  test("default limit = 8KB", () => {
    const budget = new SessionStartBudget();
    expect(budget.limit).toBe(SESSION_START_TOTAL_BUDGET_BYTES);
    expect(budget.limit).toBe(8 * 1024);
  });

  test("빈 lines → truncated false, used 0", () => {
    const budget = new SessionStartBudget();
    const r = budget.enforce([]);
    expect(r.truncated).toBe(false);
    expect(r.usedBytes).toBe(0);
    expect(r.lines).toEqual([]);
  });

  test("한도 정확히 일치 → truncated false", () => {
    const text = "a".repeat(50);
    const budget = new SessionStartBudget(50);
    const r = budget.enforce([text]);
    expect(r.truncated).toBe(false);
    expect(r.usedBytes).toBe(50);
  });

  test("alarm 라인 포함 후에도 한도 안 — drop 더 진행", () => {
    // 한도 250B (알림 라인 ~80~100B + 일부 라인 보존 가능)
    const budget = new SessionStartBudget(250);
    const lines = Array.from({ length: 20 }, () => "x".repeat(50));
    const r = budget.enforce(lines);
    expect(r.truncated).toBe(true);
    // 알림 라인 포함해도 한도 안에 들어가야 함
    expect(r.usedBytes).toBeLessThanOrEqual(250);
  });
});
