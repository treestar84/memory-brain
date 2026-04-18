import { describe, test, expect } from "bun:test";
import { CueCardInjector } from "../../../src/core/flow/CueCardInjector";

describe("CueCardInjector", () => {
  const inj = new CueCardInjector();

  test("returns full body when under budget", () => {
    const md = "---\nproblemId: p\n---\n\n## A\nshort\n\n## B\nalso short";
    const out = inj.projectForStdout(md, 10_000);
    expect(out).toBe(md);
  });

  test("truncates at section boundary when over budget", () => {
    const body = "## A\n" + "x".repeat(300) + "\n\n## B\n" + "y".repeat(300) + "\n\n## C\n" + "z".repeat(300);
    const md = "---\nproblemId: p\n---\n\n" + body;
    const out = inj.projectForStdout(md, 500);
    expect(out).toContain("## A");
    expect(out).not.toContain("## C");
    expect(out).toContain("섹션");
    expect(out).toContain("생략");
  });

  test("never cuts mid-section", () => {
    const md = "---\n---\n\n## A\n" + "x".repeat(5000);
    const out = inj.projectForStdout(md, 200);
    expect(out).not.toContain("xxxxx");
  });

  test("preserves front matter", () => {
    const md = "---\nproblemId: p\nblockCount: 5\n---\n\n## A\n" + "x".repeat(5000);
    const out = inj.projectForStdout(md, 200);
    expect(out).toContain("problemId: p");
    expect(out).toContain("blockCount: 5");
  });

  test("body without front matter still handled", () => {
    const md = "## A\n" + "x".repeat(100) + "\n\n## B\n" + "y".repeat(100);
    const out = inj.projectForStdout(md, 50);
    expect(out).not.toContain("xxxxx");
    expect(out).not.toContain("yyyyy");
  });

  test("byte budget respected using UTF-8 encoding", () => {
    const md = "---\n---\n\n## 한글\n" + "가".repeat(100);
    const out = inj.projectForStdout(md, 50);
    const bytes = new TextEncoder().encode(out).length;
    expect(bytes).toBeLessThanOrEqual(500);
  });
});
