import { describe, test, expect } from "bun:test";
import { Router } from "../../../src/core/router/Router";

describe("Router (facade)", () => {
  const r = new Router();

  test("decide — DEEP 분류 → concept/decision/persona lane summary", () => {
    const d = r.decide("이 시스템 아키텍처를 분석해줘");
    expect(d.classification.categories).toContain("DEEP");
    expect(d.selection.lanes).toContain("concept");
    expect(d.summary).toContain("DEEP");
    expect(d.summary).toContain("concept");
  });

  test("decide — QUICK fallback → lane 없음", () => {
    const d = r.decide("ok");
    expect(d.classification.categories).toEqual(["QUICK"]);
    expect(d.selection.lanes).toEqual([]);
    expect(d.summary).toContain("(no lanes)");
  });

  test("decide — PROJECT + CODE 다중 → current/project/code union", () => {
    const d = r.decide("PR-V3.3 구현 진행, src/core/router/Router.ts 보강");
    expect(d.classification.categories).toContain("PROJECT");
    expect(d.classification.categories).toContain("CODE");
    expect(d.selection.lanes).toContain("current");
    expect(d.selection.lanes).toContain("project");
    expect(d.selection.lanes).toContain("code");
  });

  test("summary 형식 — 'route: [...] → lanes: ...'", () => {
    const d = r.decide("내 선호 스타일 기록해줘");
    expect(d.summary).toMatch(/route:\s*\[/);
    expect(d.summary).toContain("→ lanes:");
  });
});
