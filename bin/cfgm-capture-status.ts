#!/usr/bin/env bun
import { Glob } from "bun";
import { resolve } from "node:path";
import { stat } from "node:fs/promises";

/**
 * cfgm-capture-status — capture 큐 (jobs) + drafts 상태 보기.
 *
 * 사용법:
 *   bun run bin/cfgm-capture-status.ts
 *   bun run bin/cfgm-capture-status.ts --json
 */

const repoRoot = process.env.CFGM_PROJECT_ROOT ?? process.env.CFGM_PROJECT ?? process.cwd();
const json = process.argv.includes("--json");
const jobsDir = resolve(repoRoot, "memory/_pending/capture/jobs");
const draftsDir = resolve(repoRoot, "memory/_pending/capture/drafts");

interface JobSummary {
  file: string;
  status: string;
  failureReason?: string;
}

const summaries: JobSummary[] = [];
const counts: Record<string, number> = { pending: 0, in_progress: 0, done: 0, failed: 0, unknown: 0 };

const STATUS_RE = /^status:\s*(\w+)\s*$/m;
const FAILURE_RE = /^failure_reason:\s*(.+)$/m;

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
    summaries.push({ file: rel, status, failureReason });
  }
}

const drafts: string[] = [];
let draftsDirExists = false;
try {
  draftsDirExists = (await stat(draftsDir)).isDirectory();
} catch { /* ENOENT */ }
if (draftsDirExists) {
  const glob = new Glob("*.md");
  for await (const rel of glob.scan({ cwd: draftsDir })) drafts.push(rel);
}

if (json) {
  console.log(JSON.stringify({ jobsDir, draftsDir, counts, jobs: summaries, drafts }, null, 2));
} else {
  console.log(`Capture queue — ${jobsDir}`);
  console.log(`pending=${counts.pending} in_progress=${counts.in_progress} done=${counts.done} failed=${counts.failed}`);
  const failed = summaries.filter((s) => s.status === "failed");
  if (failed.length > 0) {
    console.log(`\nFailed:`);
    for (const f of failed) console.log(`  - ${f.file}${f.failureReason ? ` — ${f.failureReason}` : ""}`);
  }
  console.log(`\nDrafts (${drafts.length}) — ${draftsDir}`);
  for (const d of drafts) console.log(`  - ${d}`);
  if (counts.pending > 0) {
    console.log(`\n→ host LLM 처리 필요: ${counts.pending} 건. 자연어 요청 예: "memory-brain capture pending 처리해줘"`);
  }
  if (drafts.length > 0) {
    console.log(`\n→ draft 검토 후 승격: cfgm capture-accept <slug> --type concept|decision|project`);
  }
}
