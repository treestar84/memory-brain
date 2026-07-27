#!/usr/bin/env bun
import { Glob } from "bun";
import { resolve } from "node:path";
import { stat } from "node:fs/promises";
import { resolveStorageRoot, resolveRepoRoot } from "../src/hooks/bootstrap";

/**
 * cfgm-capture-status — capture 큐 (jobs) + drafts 상태 보기.
 *
 * repo 큐 (memory/_pending/capture/, `cfgm capture` CLI 가 쓰는 위치) 와
 * storage 큐 (<storageRoot>/_pending/capture/, session-end 자동 capture 가 쓰는 위치)
 * 양쪽을 집계하고 위치를 라벨링해 보여준다.
 *
 * 사용법:
 *   bun run bin/cfgm-capture-status.ts
 *   bun run bin/cfgm-capture-status.ts --json
 */

const repoRoot = resolveRepoRoot();
const json = process.argv.includes("--json");

interface JobSummary {
  file: string;
  status: string;
  failureReason?: string;
}

interface LocationSummary {
  label: "repo" | "storage";
  root: string;
  jobsDir: string;
  draftsDir: string;
  counts: Record<string, number>;
  jobs: JobSummary[];
  drafts: string[];
}

const STATUS_RE = /^status:\s*(\w+)\s*$/m;
const FAILURE_RE = /^failure_reason:\s*(.+)$/m;

async function summarizeLocation(label: "repo" | "storage", root: string): Promise<LocationSummary> {
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

// repo 큐는 기존 경로 규칙 그대로 memory/_pending/capture/ 아래에 위치한다.
const repoCaptureRoot = resolve(repoRoot, "memory");
const storageRoot = resolveStorageRoot();

const locations: LocationSummary[] = [
  await summarizeLocation("repo", repoCaptureRoot),
];
// storage 큐가 repo 큐와 동일 경로를 가리키면(예: 테스트 환경) 중복 집계를 피한다.
if (resolve(storageRoot) !== resolve(repoCaptureRoot)) {
  locations.push(await summarizeLocation("storage", storageRoot));
}

const totalCounts: Record<string, number> = { pending: 0, in_progress: 0, done: 0, failed: 0, unknown: 0 };
const allJobs: JobSummary[] = [];
const allDrafts: string[] = [];
for (const loc of locations) {
  for (const [status, n] of Object.entries(loc.counts)) totalCounts[status] = (totalCounts[status] ?? 0) + n;
  allJobs.push(...loc.jobs);
  allDrafts.push(...loc.drafts);
}

if (json) {
  console.log(JSON.stringify({
    jobsDir: locations[0]!.jobsDir,
    draftsDir: locations[0]!.draftsDir,
    counts: totalCounts,
    jobs: allJobs,
    drafts: allDrafts,
    locations,
  }, null, 2));
} else {
  console.log(`Capture queue — ${locations.length}개 위치 집계`);
  for (const loc of locations) {
    console.log(`\n[${loc.label}] ${loc.jobsDir}`);
    console.log(`  pending=${loc.counts.pending} in_progress=${loc.counts.in_progress} done=${loc.counts.done} failed=${loc.counts.failed}`);
    const failed = loc.jobs.filter((j) => j.status === "failed");
    for (const f of failed) console.log(`    - ${f.file}${f.failureReason ? ` — ${f.failureReason}` : ""}`);
    console.log(`  drafts (${loc.drafts.length}) — ${loc.draftsDir}`);
    for (const d of loc.drafts) console.log(`    - ${d}`);
  }
  console.log(`\n합계: pending=${totalCounts.pending} in_progress=${totalCounts.in_progress} done=${totalCounts.done} failed=${totalCounts.failed}`);
  if (totalCounts.pending > 0) {
    console.log(`\n→ host LLM 처리 필요: ${totalCounts.pending} 건. 자연어 요청 예: "memory-brain capture pending 처리해줘"`);
  }
  if (allDrafts.length > 0) {
    console.log(`\n→ draft 검토 후 승격: cfgm capture-accept <slug> --type concept|decision|project`);
  }
}
