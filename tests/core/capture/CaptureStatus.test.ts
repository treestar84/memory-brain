import { describe, test, expect } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { summarizeCaptureQueue } from "../../../src/core/capture/CaptureStatus";

describe("summarizeCaptureQueue", () => {
  test("repo/storage 큐가 다른 경로면 둘 다 집계하고 합산한다", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "capture-status-"));
    const storageRoot = resolve(projectRoot, ".memory-brain");
    try {
      const repoJobsDir = resolve(projectRoot, "memory/_pending/capture/jobs");
      const storageJobsDir = resolve(storageRoot, "_pending/capture/jobs");
      await mkdir(repoJobsDir, { recursive: true });
      await mkdir(storageJobsDir, { recursive: true });
      await writeFile(join(repoJobsDir, "a.job.md"), "---\nstatus: done\n---\n");
      await writeFile(join(storageJobsDir, "b.job.md"), "---\nstatus: pending\n---\n");
      await writeFile(join(storageJobsDir, "c.job.md"), "---\nstatus: failed\nfailure_reason: 파싱 실패\n---\n");

      const summary = await summarizeCaptureQueue(projectRoot, storageRoot);

      expect(summary.locations).toHaveLength(2);
      expect(summary.counts.done).toBe(1);
      expect(summary.counts.pending).toBe(1);
      expect(summary.counts.failed).toBe(1);
      expect(summary.jobs.find((j) => j.file === "c.job.md")?.failureReason).toBe("파싱 실패");
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  test("repo/storage 큐가 같은 경로면 중복 집계하지 않는다", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "capture-status-same-"));
    try {
      const repoCaptureRoot = resolve(projectRoot, "memory");
      const jobsDir = resolve(repoCaptureRoot, "_pending/capture/jobs");
      await mkdir(jobsDir, { recursive: true });
      await writeFile(join(jobsDir, "a.job.md"), "---\nstatus: done\n---\n");

      const summary = await summarizeCaptureQueue(projectRoot, repoCaptureRoot);

      expect(summary.locations).toHaveLength(1);
      expect(summary.counts.done).toBe(1);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  test("아무 큐도 없는 프로젝트 → 전부 0, 에러 없음", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "capture-status-empty-"));
    try {
      const summary = await summarizeCaptureQueue(projectRoot, resolve(projectRoot, ".memory-brain"));
      expect(summary.counts).toEqual({ pending: 0, in_progress: 0, done: 0, failed: 0, unknown: 0 });
      expect(summary.jobs).toEqual([]);
      expect(summary.drafts).toEqual([]);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
