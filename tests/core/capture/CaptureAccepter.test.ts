import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  acceptDraft,
  acceptAllDrafts,
  listDraftSlugs,
  inferTypeFromDraft,
  isSafeSlug,
  CaptureAcceptError,
} from "../../../src/core/capture/CaptureAccepter";

function draftText(opts: { id: string; type: string; status?: string }): string {
  return `---\nid: ${opts.id}\ntype: ${opts.type}\nstatus: ${opts.status ?? "draft"}\nconfidence: high\nupdated_at: 2026-07-26\n---\n\n# ${opts.id}\n\nbody.\n`;
}

describe("inferTypeFromDraft / isSafeSlug", () => {
  test("frontmatter type 추출", () => {
    expect(inferTypeFromDraft(draftText({ id: "decision.x", type: "decision" }))).toBe("decision");
  });

  test("frontmatter 없으면 null", () => {
    expect(inferTypeFromDraft("# no frontmatter")).toBeNull();
  });

  test("slug 안전성 — 경로 구분자/.. 거부", () => {
    expect(isSafeSlug("ok-slug_1")).toBe(true);
    expect(isSafeSlug("../escape")).toBe(false);
    expect(isSafeSlug("a/b")).toBe(false);
    expect(isSafeSlug("")).toBe(false);
  });
});

describe("acceptDraft", () => {
  let dir: string;
  let draftsDir: string;
  let memoryDir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "capture-accepter-"));
    draftsDir = resolve(dir, "drafts");
    memoryDir = resolve(dir, "memory");
    await mkdir(draftsDir, { recursive: true });
    await mkdir(memoryDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("type 생략 — frontmatter 에서 자동 추론해 승격", async () => {
    await writeFile(join(draftsDir, "my-decision.md"), draftText({ id: "decision.my-decision", type: "decision" }));
    const result = await acceptDraft({ slug: "my-decision", draftsDir, memoryDir });
    expect(result.type).toBe("decision");
    expect(result.targetPath).toBe(resolve(memoryDir, "decisions/my-decision.md"));
    expect(await Bun.file(result.targetPath).exists()).toBe(true);
    expect(await Bun.file(join(draftsDir, "my-decision.md")).exists()).toBe(false);
  });

  test("status: draft → active 로 승격", async () => {
    await writeFile(join(draftsDir, "c.md"), draftText({ id: "concept.c", type: "concept" }));
    const result = await acceptDraft({ slug: "c", draftsDir, memoryDir });
    const txt = await Bun.file(result.targetPath).text();
    expect(txt).toMatch(/^status: active$/m);
  });

  test("--type 지정이 frontmatter 와 일치하면 통과", async () => {
    await writeFile(join(draftsDir, "p.md"), draftText({ id: "project.p", type: "project" }));
    const result = await acceptDraft({ slug: "p", draftsDir, memoryDir, type: "project" });
    expect(result.type).toBe("project");
  });

  test("--type 지정이 frontmatter 와 불일치하면 에러", async () => {
    await writeFile(join(draftsDir, "p2.md"), draftText({ id: "project.p2", type: "project" }));
    await expect(acceptDraft({ slug: "p2", draftsDir, memoryDir, type: "decision" })).rejects.toThrow(
      CaptureAcceptError,
    );
  });

  test("frontmatter 도 없고 --type 도 없으면 에러", async () => {
    await writeFile(join(draftsDir, "bad.md"), "# no frontmatter\n");
    await expect(acceptDraft({ slug: "bad", draftsDir, memoryDir })).rejects.toThrow(CaptureAcceptError);
  });

  test("존재하지 않는 draft → 에러", async () => {
    await expect(acceptDraft({ slug: "nope", draftsDir, memoryDir })).rejects.toThrow(CaptureAcceptError);
  });

  test("이미 존재하는 page → force 없이 거부", async () => {
    await mkdir(resolve(memoryDir, "decisions"), { recursive: true });
    await writeFile(resolve(memoryDir, "decisions/dup.md"), "existing");
    await writeFile(join(draftsDir, "dup.md"), draftText({ id: "decision.dup", type: "decision" }));
    await expect(acceptDraft({ slug: "dup", draftsDir, memoryDir })).rejects.toThrow(CaptureAcceptError);
  });

  test("이미 존재하는 page → force 시 _archive 로 보관 후 supersede", async () => {
    await mkdir(resolve(memoryDir, "decisions"), { recursive: true });
    await writeFile(resolve(memoryDir, "decisions/dup2.md"), "old content");
    await writeFile(join(draftsDir, "dup2.md"), draftText({ id: "decision.dup2", type: "decision" }));
    const result = await acceptDraft({ slug: "dup2", draftsDir, memoryDir, force: true });
    expect(result.supersededExisting).toBe(true);
    expect(result.archivePath).toBe(resolve(memoryDir, "decisions/_archive/dup2.md"));
    expect(await Bun.file(result.archivePath!).text()).toBe("old content");
  });

  test("잘못된 slug → 에러", async () => {
    await expect(acceptDraft({ slug: "../escape", draftsDir, memoryDir })).rejects.toThrow(CaptureAcceptError);
  });
});

describe("listDraftSlugs / acceptAllDrafts", () => {
  let dir: string;
  let draftsDir: string;
  let memoryDir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "capture-accepter-all-"));
    draftsDir = resolve(dir, "drafts");
    memoryDir = resolve(dir, "memory");
    await mkdir(draftsDir, { recursive: true });
    await mkdir(memoryDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("존재하지 않는 디렉토리 → 빈 배열 (에러 아님)", async () => {
    expect(await listDraftSlugs(resolve(dir, "no-such-dir"))).toEqual([]);
  });

  test("서로 다른 type 의 draft 여러 개를 한 번에 승격", async () => {
    await writeFile(join(draftsDir, "d1.md"), draftText({ id: "decision.d1", type: "decision" }));
    await writeFile(join(draftsDir, "c1.md"), draftText({ id: "concept.c1", type: "concept" }));

    const { accepted, failed } = await acceptAllDrafts({ draftsDir, memoryDir });
    expect(accepted).toHaveLength(2);
    expect(failed).toHaveLength(0);
    expect(await Bun.file(resolve(memoryDir, "decisions/d1.md")).exists()).toBe(true);
    expect(await Bun.file(resolve(memoryDir, "concepts/c1.md")).exists()).toBe(true);
  });

  test("일부 실패해도 나머지는 계속 처리 (부분 실패 격리)", async () => {
    await writeFile(join(draftsDir, "good.md"), draftText({ id: "decision.good", type: "decision" }));
    await writeFile(join(draftsDir, "bad.md"), "# no frontmatter, no type\n");

    const { accepted, failed } = await acceptAllDrafts({ draftsDir, memoryDir });
    expect(accepted).toHaveLength(1);
    expect(accepted[0]!.slug).toBe("good");
    expect(failed).toHaveLength(1);
    expect(failed[0]!.slug).toBe("bad");
  });

  test("빈 큐 → accepted/failed 둘 다 빈 배열", async () => {
    const { accepted, failed } = await acceptAllDrafts({ draftsDir, memoryDir });
    expect(accepted).toEqual([]);
    expect(failed).toEqual([]);
  });
});
