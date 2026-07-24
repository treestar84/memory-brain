import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { enqueueSource, slugFromPath } from "../../../src/core/capture/CaptureEnqueuer";

describe("CaptureEnqueuer", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "capture-enqueuer-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("새 source → job.md 생성 + frontmatter 필드 검증", async () => {
    const jobsDir = resolve(dir, "jobs");
    const result = await enqueueSource({
      sourcePath: "note.md",
      sourceText: "안녕하세요 — 테스트 원본",
      jobsDir,
      draftsDir: "drafts",
      specDir: "_spec",
      now: new Date("2026-07-24T00:00:00Z"),
    });

    expect(result.enqueued).toBe(true);
    expect(result.skipped).toBe(false);
    expect(result.jobPath).toBe(resolve(jobsDir, "note.job.md"));

    const txt = await Bun.file(result.jobPath!).text();
    expect(txt).toMatch(/^job_id: cap-2026-07-24-note$/m);
    expect(txt).toMatch(/^status: pending$/m);
    expect(txt).toMatch(/^source_path: note\.md$/m);
    expect(txt).toMatch(/^source_sha256: [0-9a-f]{64}$/m);
    expect(txt).toMatch(/^drafts_dir: drafts$/m);
  });

  test("동일 SHA 재호출 → skipped", async () => {
    const jobsDir = resolve(dir, "jobs");
    const opts = {
      sourcePath: "note.md",
      sourceText: "동일 내용",
      jobsDir,
      draftsDir: "drafts",
      specDir: "_spec",
    };
    const first = await enqueueSource(opts);
    expect(first.enqueued).toBe(true);

    const second = await enqueueSource(opts);
    expect(second.enqueued).toBe(false);
    expect(second.skipped).toBe(true);
  });

  test("force=true → SHA 동일해도 재enqueue", async () => {
    const jobsDir = resolve(dir, "jobs");
    const opts = {
      sourcePath: "note.md",
      sourceText: "동일 내용",
      jobsDir,
      draftsDir: "drafts",
      specDir: "_spec",
    };
    await enqueueSource(opts);
    const forced = await enqueueSource({ ...opts, force: true });
    expect(forced.enqueued).toBe(true);
    expect(forced.skipped).toBe(false);
  });

  test("extraNote 를 job 본문에 병기한다", async () => {
    const jobsDir = resolve(dir, "jobs");
    const result = await enqueueSource({
      sourcePath: "session-abc.md",
      sourceText: "세션 요약",
      jobsDir,
      draftsDir: "drafts",
      specDir: "_spec",
      extraNote: "storage 큐 안내문",
    });
    const txt = await Bun.file(result.jobPath!).text();
    expect(txt).toContain("storage 큐 안내문");
  });

  test("slugFromPath — 파일명을 안전한 slug 로 변환", () => {
    expect(slugFromPath("session-sess-001.md")).toBe("session-sess-001");
    expect(slugFromPath("../weird/path with spaces.txt")).toBe("path-with-spaces");
    expect(slugFromPath("")).toBe("capture");
  });
});
