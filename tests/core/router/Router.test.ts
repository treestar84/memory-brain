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

  // PR-V3.10 — RouterMappings 통합

  test("decide — PR keyword → mapping.files 에 memory/current.md 포함", () => {
    const d = r.decide("PR-V3.10 진행");
    expect(d.mapping).toBeDefined();
    expect(d.mapping!.files).toContain("memory/current.md");
    expect(d.mapping!.files).toContain("memory/projects/memory-brain.md");
  });

  test("decide — ADR keyword → mapping.files 에 동적 path 포함", () => {
    const d = r.decide("ADR-018 게이트");
    expect(d.mapping!.files).toContain("docs/adr/018-*.md");
  });

  test("decide — vision keyword → memory_system_improvement_prompt.md 노출", () => {
    const d = r.decide("비전 §16 답습");
    expect(d.mapping!.files).toContain("memory_system_improvement_prompt.md");
  });

  test("decide — mapping 없음 → mapping undefined, summary 에 'files' 없음", () => {
    const d = r.decide("ok");
    expect(d.mapping).toBeUndefined();
    expect(d.summary).not.toContain("→ files:");
  });

  test("summary — files ≥ 1 시 '→ files: ...' 추가", () => {
    const d = r.decide("PR-V3.10");
    expect(d.summary).toContain("→ files:");
    expect(d.summary).toContain("memory/current.md");
  });

  test("summary — files > 5 시 '+N' 표시", () => {
    const d = r.decide("PR-V3.10 OSS Honcho ADR-12 vision");
    if (d.mapping && d.mapping.files.length > 5) {
      expect(d.summary).toMatch(/\(\+\d+\)/);
    }
  });
});
