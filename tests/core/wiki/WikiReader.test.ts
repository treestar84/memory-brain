import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WikiReader } from "../../../src/core/wiki/WikiReader";

const SAMPLE_PAGE = `---
id: decision.test-policy
type: decision
status: active
confidence: high
tags: [test, sample]
related: [project.x]
supersedes: []
updated_at: 2026-04-27
---

# 테스트 페이지

## Summary

<!-- claim:cl-t-001 -->
첫 진술.

## Key Decisions

<!-- claim:cl-t-002 -->
두 번째 진술.

<!-- claim:cl-t-003 -->
세 번째 진술.

## Evidence

- \`docs/adr/100.md\` — 인용 1
- \`commit:deadbeef\` — 인용 2
- 사용자 발화: "..."

## Related

- [[project.x]]
`;

describe("WikiReader.parse", () => {
  const reader = new WikiReader();

  test("정상 frontmatter + body → 파싱 성공", () => {
    const page = reader.parse("decisions/test-policy.md", SAMPLE_PAGE);
    expect(page).not.toBeNull();
    expect(page!.frontmatter.id).toBe("decision.test-policy");
    expect(page!.frontmatter.type).toBe("decision");
    expect(page!.frontmatter.status).toBe("active");
    expect(page!.frontmatter.tags).toEqual(["test", "sample"]);
  });

  test("claim id 3개 모두 추출", () => {
    const page = reader.parse("p.md", SAMPLE_PAGE)!;
    expect(page.claimIds).toEqual(["cl-t-001", "cl-t-002", "cl-t-003"]);
  });

  test("Evidence 섹션 bullet 3개 추출", () => {
    const page = reader.parse("p.md", SAMPLE_PAGE)!;
    expect(page.evidence).toHaveLength(3);
    expect(page.evidence[0]).toContain("docs/adr/100.md");
    expect(page.evidence[2]).toContain("사용자 발화");
  });

  test("frontmatter 누락 → null", () => {
    expect(reader.parse("p.md", "# no frontmatter")).toBeNull();
  });

  test("frontmatter id 누락 → null", () => {
    const text = `---
type: decision
status: active
updated_at: 2026-04-27
---

body`;
    expect(reader.parse("p.md", text)).toBeNull();
  });

  test("Evidence 섹션 없음 → 빈 배열", () => {
    const text = `---
id: t.x
type: concept
status: draft
updated_at: 2026-04-27
---

# X

<!-- claim:cl-x-1 -->
하나만.
`;
    const page = reader.parse("p.md", text)!;
    expect(page.evidence).toEqual([]);
    expect(page.claimIds).toEqual(["cl-x-1"]);
  });

  test("claim id 형식 — cl- prefix 만 매치", () => {
    const text = `---
id: t.y
type: concept
status: active
updated_at: 2026-04-27
---

<!-- claim:cl-good -->
<!-- claim:bad -->
<!-- not-claim -->
`;
    const page = reader.parse("p.md", text)!;
    expect(page.claimIds).toEqual(["cl-good"]);
  });
});

describe("WikiReader.read (실제 파일)", () => {
  let dir: string;
  let reader: WikiReader;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "wiki-"));
    await mkdir(join(dir, "decisions"), { recursive: true });
    await writeFile(join(dir, "decisions", "test-policy.md"), SAMPLE_PAGE);
    reader = new WikiReader(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("read — 실제 파일 → WikiPage", async () => {
    const page = await reader.read("decisions/test-policy.md");
    expect(page).not.toBeNull();
    expect(page!.frontmatter.id).toBe("decision.test-policy");
    expect(page!.claimIds).toHaveLength(3);
  });

  test("read — 파일 없음 → null", async () => {
    expect(await reader.read("decisions/nope.md")).toBeNull();
  });

  test("readAllInDir — README 제외 + 1개 페이지", async () => {
    await writeFile(join(dir, "decisions", "README.md"), "# Decisions\n");
    const pages = await reader.readAllInDir("decisions");
    expect(pages).toHaveLength(1);
    expect(pages[0]!.frontmatter.id).toBe("decision.test-policy");
  });
});
