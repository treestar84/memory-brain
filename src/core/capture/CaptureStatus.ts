import { Glob } from "bun";
import { resolve } from "node:path";
import { stat } from "node:fs/promises";

/**
 * cfgm-capture-status / 대시보드가 공유하는 capture 큐 집계 로직 (V3.43).
 *
 * repo 큐 (memory/_pending/capture/, `cfgm capture` CLI 가 쓰는 위치) 와
 * storage 큐 (<storageRoot>/_pending/capture/, session-end 자동 capture 가 쓰는 위치)
 * 양쪽을 집계하고 위치를 라벨링해 반환한다.
 */

export interface JobSummary {
  file: string;
  status: string;
  failureReason?: string;
}

export interface LocationSummary {
  label: "repo" | "storage";
  root: string;
  jobsDir: string;
  draftsDir: string;
  counts: Record<string, number>;
  jobs: JobSummary[];
  drafts: string[];
}

export interface CaptureQueueSummary {
  jobsDir: string;
  draftsDir: string;
  counts: Record<string, number>;
  jobs: JobSummary[];
  drafts: string[];
  locations: LocationSummary[];
}

const STATUS_RE = /^status:\s*(\w+)\s*$/m;
const FAILURE_RE = /^failure_reason:\s*(.+)$/m;

export async function summarizeCaptureLocation(label: "repo" | "storage", root: string): Promise<LocationSummary> {
  const jobsDir = resolve(root, "_pending/capture/jobs");
  const draftsDir = resolve(root, "_pending/capture/drafts");
  const counts: Record<string, number> = { pending: 0, in_progress: 0, done: 0, failed: 0, unknown: 0 };
  const jobs: JobSummary[] = [];
  const drafts: string[] = [];

  let jobsDirExists = false;
  try {
    jobsDirExists = (await stat(jobsDir)).isDirectory();
  } catch { /* ENOENT */ }

  if (jobsDirExists) {
    const glob = new Glob("**/*.job.md");
    for await (const rel of glob.scan({ cwd: jobsDir })) {
      const fullPath = resolve(jobsDir, rel);
      const txt = await Bun.file(fullPath).text();
      const statusMatch = txt.match(STATUS_RE);
      const status = (statusMatch ? statusMatch[1] : "unknown").toLowerCase();
      const failureMatch = txt.match(FAILURE_RE);
      const failureReason = failureMatch ? failureMatch[1] : undefined;
      counts[status] = (counts[status] ?? 0) + 1;
      jobs.push({ file: rel, status, failureReason });
    }
  }

  let draftsDirExists = false;
  try {
    draftsDirExists = (await stat(draftsDir)).isDirectory();
  } catch { /* ENOENT */ }
  if (draftsDirExists) {
    const glob = new Glob("*.md");
    for await (const rel of glob.scan({ cwd: draftsDir })) drafts.push(rel);
  }

  return { label, root, jobsDir, draftsDir, counts, jobs, drafts };
}

/** repo 큐(memory/_pending/capture) + storage 큐(<storageRoot>/_pending/capture) 합산 집계. */
export async function summarizeCaptureQueue(repoRoot: string, storageRoot: string): Promise<CaptureQueueSummary> {
  const repoCaptureRoot = resolve(repoRoot, "memory");
  const locations: LocationSummary[] = [await summarizeCaptureLocation("repo", repoCaptureRoot)];
  // storage 큐가 repo 큐와 동일 경로를 가리키면(예: 테스트 환경) 중복 집계를 피한다.
  if (resolve(storageRoot) !== resolve(repoCaptureRoot)) {
    locations.push(await summarizeCaptureLocation("storage", storageRoot));
  }

  const totalCounts: Record<string, number> = { pending: 0, in_progress: 0, done: 0, failed: 0, unknown: 0 };
  const allJobs: JobSummary[] = [];
  const allDrafts: string[] = [];
  for (const loc of locations) {
    for (const [status, n] of Object.entries(loc.counts)) totalCounts[status] = (totalCounts[status] ?? 0) + n;
    allJobs.push(...loc.jobs);
    allDrafts.push(...loc.drafts);
  }

  return {
    jobsDir: locations[0]!.jobsDir,
    draftsDir: locations[0]!.draftsDir,
    counts: totalCounts,
    jobs: allJobs,
    drafts: allDrafts,
    locations,
  };
}
