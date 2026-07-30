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

  test("frontmatter 누락 → note type 로 합성 (V3.41, null 아님)", () => {
    const page = reader.parse("p.md", "# no frontmatter");
    expect(page).not.toBeNull();
    expect(page!.frontmatter.type).toBe("note");
    expect(page!.frontmatter.status).toBe("draft");
    expect(page!.body).toBe("# no frontmatter");
  });

  test("frontmatter 누락 + 빈 본문 → null", () => {
    expect(reader.parse("p.md", "   \n\n")).toBeNull();
  });

  test("note id 는 경로에서 유도되고 note. 네임스페이스를 쓴다", () => {
    const page = reader.parse("journal/2026-07-26.md", "# 일지")!;
    expect(page.frontmatter.id).toBe("note.journal.2026-07-26");
  });

  test("note updated_at — fallback 미지정 시 unknown", () => {
    const page = reader.parse("current.md", "# 현재")!;
    expect(page.frontmatter.updated_at).toBe("unknown");
  });

  test("note updated_at — fallback 지정 시 그대로 사용 (read() 가 mtime 전달)", () => {
    const page = reader.parse("current.md", "# 현재", "2026-07-26T00:00:00.000Z")!;
    expect(page.frontmatter.updated_at).toBe("2026-07-26T00:00:00.000Z");
  });

  test("note 도 claim 마커가 있으면 그대로 추출된다", () => {
    const text = "# 일지\n\n<!-- claim:cl-note-1 -->\n어떤 사실.\n";
    const page = reader.parse("current.md", text)!;
    expect(page.claimIds).toEqual(["cl-note-1"]);
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

  test("readAllInDir — memoryDir 자체가 없어도(신규 프로젝트, 캡처 0건) 예외 대신 빈 배열", async () => {
    const emptyProjectDir = await mkdtemp(join(tmpdir(), "wiki-reader-no-memory-"));
    try {
      const freshReader = new WikiReader(join(emptyProjectDir, "memory"));
      expect(await freshReader.readAllInDir("decisions")).toEqual([]);
      expect(await freshReader.listCanonicalPages()).toEqual([]);
    } finally {
      await rm(emptyProjectDir, { recursive: true, force: true });
    }
  });

  test("read — frontmatter 없는 실제 파일도 note 로 읽히고 mtime 이 updated_at 이 된다", async () => {
    await writeFile(join(dir, "current.md"), "# memory/current.md\n\n작업 로그.\n");
    const page = await reader.read("current.md");
    expect(page).not.toBeNull();
    expect(page!.frontmatter.type).toBe("note");
    expect(page!.frontmatter.id).toBe("note.current");
    expect(Number.isNaN(Date.parse(page!.frontmatter.updated_at))).toBe(false);
  });
});

describe("WikiReader.readNoteChunks — ## 헤딩 단위 분할 (V3.41)", () => {
  let dir: string;
  let reader: WikiReader;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "wiki-chunks-"));
    reader = new WikiReader(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const MULTI_TOPIC = `# memory/current.md — 현재 작업

> 운영 규칙 서문.

## V3.39 RotAdapter 버그 수정

setTimeout 이 clearTimeout 안 돼서 30초씩 안 끝났다.

## V3.40 플러그인 보안 리뷰

SessionStart 훅이 승인 없이 bun install 실행 — supply-chain-rce 지적.
`;

  test("## 헤딩 2개 → chunk 3개 (서문 + 헤딩별 1개씩), 각기 다른 id", async () => {
    await writeFile(join(dir, "current.md"), MULTI_TOPIC);
    const pages = await reader.readNoteChunks("current.md");
    expect(pages).toHaveLength(3);
    expect(pages.map((p) => p.frontmatter.id)).toEqual(["note.current.1", "note.current.2", "note.current.3"]);
    expect(pages.every((p) => p.frontmatter.type === "note")).toBe(true);
  });

  test("각 chunk 는 자기 주제만 담는다 — 무관한 주제가 섞이지 않는다", async () => {
    await writeFile(join(dir, "current.md"), MULTI_TOPIC);
    const pages = await reader.readNoteChunks("current.md");
    const rotChunk = pages.find((p) => p.body.includes("clearTimeout"));
    const secChunk = pages.find((p) => p.body.includes("supply-chain-rce"));
    expect(rotChunk).toBeDefined();
    expect(secChunk).toBeDefined();
    expect(rotChunk!.body).not.toContain("supply-chain-rce");
    expect(secChunk!.body).not.toContain("clearTimeout");
  });

  test("## 헤딩 없는 파일 → chunk 1개 (기존 단일 페이지 동작 유지)", async () => {
    await writeFile(join(dir, "current.md"), "# 짧은 노트\n\n헤딩 없음.\n");
    const pages = await reader.readNoteChunks("current.md");
    expect(pages).toHaveLength(1);
    expect(pages[0]!.frontmatter.id).toBe("note.current");
  });

  test("frontmatter 있는 정식 wiki page → 쪼개지 않고 그대로 1개", async () => {
    await writeFile(join(dir, "sample.md"), SAMPLE_PAGE);
    const pages = await reader.readNoteChunks("sample.md");
    expect(pages).toHaveLength(1);
    expect(pages[0]!.frontmatter.id).toBe("decision.test-policy");
  });

  test("파일 없음 → 빈 배열", async () => {
    expect(await reader.readNoteChunks("nope.md")).toEqual([]);
  });

  test("readAllInDirAsNoteChunks — 디렉토리 내 모든 파일을 chunk 로 확장", async () => {
    await mkdir(join(dir, "journal"), { recursive: true });
    await writeFile(join(dir, "journal", "a.md"), MULTI_TOPIC);
    await writeFile(join(dir, "journal", "README.md"), "# 목차\n");
    const pages = await reader.readAllInDirAsNoteChunks("journal");
    expect(pages).toHaveLength(3);
  });

  test("listCanonicalPages — projects/concepts/decisions 를 모아 반환, `_` 프리픽스 서브디렉토리 제외", async () => {
    await mkdir(join(dir, "concepts"), { recursive: true });
    await mkdir(join(dir, "decisions"), { recursive: true });
    await mkdir(join(dir, "concepts", "_ssl"), { recursive: true });
    await writeFile(join(dir, "concepts", "example.md"), SAMPLE_PAGE.replace("decision.test-policy", "concept.example"));
    await writeFile(join(dir, "decisions", "sample.md"), SAMPLE_PAGE);
    await writeFile(
      join(dir, "concepts", "_ssl", "hidden.md"),
      SAMPLE_PAGE.replace("decision.test-policy", "concept.should-not-appear"),
    );

    const pages = await reader.listCanonicalPages();
    const ids = pages.map((p) => p.frontmatter.id).sort();
    expect(ids).toEqual(["concept.example", "decision.test-policy"]);
  });
});
