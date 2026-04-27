import { describe, test, expect, beforeEach } from "bun:test";
import { ContextBudget } from "../../../src/core/router/ContextBudget";

describe("ContextBudget", () => {
  let b: ContextBudget;

  beforeEach(() => {
    b = new ContextBudget();
  });

  test("초기 상태 — canonical 0/3, source 0/3, persona 0/2", () => {
    const s = b.snapshot();
    expect(s.canonical.used).toBe(0);
    expect(s.canonical.limit).toBe(3);
    expect(s.source.limit).toBe(3);
    expect(s.persona.limit).toBe(2);
  });

  test("consume canonical 3회 → 4번째 거부", () => {
    expect(b.consume("canonical").allowed).toBe(true);
    expect(b.consume("canonical").allowed).toBe(true);
    expect(b.consume("canonical").allowed).toBe(true);
    const r4 = b.consume("canonical");
    expect(r4.allowed).toBe(false);
    expect(r4.reason).toContain("초과");
  });

  test("persona 2회 → 3번째 거부", () => {
    b.consume("persona");
    b.consume("persona");
    expect(b.consume("persona").allowed).toBe(false);
  });

  test("check 는 used 증가 안 함", () => {
    b.check("canonical");
    b.check("canonical");
    b.check("canonical");
    expect(b.snapshot().canonical.used).toBe(0);
  });

  test("reset — 모든 슬롯 0 초기화", () => {
    b.consume("canonical");
    b.consume("source");
    b.consume("persona");
    b.reset();
    const s = b.snapshot();
    expect(s.canonical.used).toBe(0);
    expect(s.source.used).toBe(0);
    expect(s.persona.used).toBe(0);
  });

  test("슬롯별 독립 — canonical 초과해도 source 영향 없음", () => {
    b.consume("canonical");
    b.consume("canonical");
    b.consume("canonical");
    // canonical 4번째는 거부, source 1번째는 통과
    expect(b.consume("canonical").allowed).toBe(false);
    expect(b.consume("source").allowed).toBe(true);
  });
});
