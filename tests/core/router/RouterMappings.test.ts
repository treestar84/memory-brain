import { describe, test, expect } from "bun:test";
import { RouterMappings } from "../../../src/core/router/RouterMappings";

describe("RouterMappings", () => {
  const m = new RouterMappings();

  test("PR-V3.10 → current/project lane + memory/current.md + memory/projects/memory-brain.md", () => {
    const r = m.resolve("PR-V3.10 진행 중");
    expect(r.lanes).toContain("current");
    expect(r.lanes).toContain("project");
    expect(r.files).toContain("memory/current.md");
    expect(r.files).toContain("memory/projects/memory-brain.md");
  });

  test("ADR-018 → 동적 path docs/adr/018-*.md", () => {
    const r = m.resolve("ADR-018 의 게이트 정신");
    expect(r.lanes).toContain("decision");
    expect(r.files).toContain("docs/adr/018-*.md");
  });

  test("ADR 다중 — ADR-19, ADR-21 → 두 path", () => {
    const r = m.resolve("ADR-19 와 ADR-21 비교");
    expect(r.files).toContain("docs/adr/019-*.md");
    expect(r.files).toContain("docs/adr/021-*.md");
  });

  test("OSS / Honcho — 영어 + 한국어 매치", () => {
    const r = m.resolve("Honcho 도입과 OSS 정책");
    expect(r.files).toContain("memory/decisions/oss-incorporation.md");
    expect(r.files).toContain("docs/adr/019-oss-incorporation.md");
    expect(r.files).toContain("docs/adr/021-honcho-pattern-only.md");
  });

  test("vision / 비전 — 한국어 매치", () => {
    const r = m.resolve("비전 §16");
    expect(r.lanes).toContain("concept");
    expect(r.files).toContain("memory_system_improvement_prompt.md");
    expect(r.files).toContain("memory/SCHEMA.md");
  });

  test("claim/evidence/supersede — 키워드 매치", () => {
    const r = m.resolve("supersede 모델");
    expect(r.files).toContain("docs/adr/012-claim-evidence-sidecar.md");
    expect(r.files).toContain("src/core/claim/ClaimStore.ts");
  });

  test("persona / 9-file / PAI — 매치", () => {
    const r = m.resolve("PAI 9-file 정렬");
    expect(r.lanes).toContain("persona");
    expect(r.files).toContain("memory/profile/README.md");
    expect(r.files).toContain("src/core/persona/PersonaStore.ts");
  });

  test("7-layer / bootloader / router — 매치", () => {
    const r = m.resolve("bootloader 강화");
    expect(r.lanes).toContain("concept");
    expect(r.files).toContain("memory/SCHEMA.md");
    expect(r.files).toContain("CLAUDE.md");
    expect(r.files).toContain("MEMORY.md");
  });

  test("governance / lint — 매치", () => {
    const r = m.resolve("governance lint 결과");
    expect(r.lanes).toContain("governance");
  });

  test("매치 없음 → 빈 lanes/files", () => {
    const r = m.resolve("hello world");
    expect(r.lanes).toEqual([]);
    expect(r.files).toEqual([]);
    expect(r.matchedRules).toEqual([]);
  });

  test("다중 매치 — lanes/files union 중복 제거", () => {
    const r = m.resolve("PR-V3.10 의 vision 적합도");
    // PR + vision 둘 다 매치
    expect(r.matchedRules.length).toBeGreaterThanOrEqual(2);
    const unique = new Set(r.files);
    expect(unique.size).toBe(r.files.length);
  });

  test("matchedRules — 사람이 읽는 description", () => {
    const r = m.resolve("ADR-12");
    expect(r.matchedRules.some((d) => d.includes("ADR"))).toBe(true);
  });
});
