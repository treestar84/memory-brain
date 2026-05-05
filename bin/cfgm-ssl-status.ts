#!/usr/bin/env bun
import { Glob } from "bun";
import { resolve } from "node:path";
import { stat } from "node:fs/promises";

/**
 * cfgm-ssl-status — pending normalize queue 상태 보기.
 *
 * 사용법:
 *   bun run bin/cfgm-ssl-status.ts
 *   bun run bin/cfgm-ssl-status.ts --json
 *
 * 출력: pending / in_progress / done / failed 카운트 + 실패 항목 목록.
 */

const repoRoot = process.env.CFGM_PROJECT_ROOT ?? process.env.CFGM_PROJECT ?? process.cwd();
const json = process.argv.includes("--json");
const jobsDir = resolve(repoRoot, "memory/_pending/normalize/jobs");

interface JobSummary {
  file: string;
  status: string;
  failureReason?: string;
}

const summaries: JobSummary[] = [];
const counts: Record<string, number> = { pending: 0, in_progress: 0, done: 0, failed: 0, unknown: 0 };

const STATUS_RE = /^status:\s*(\w+)\s*$/m;
const FAILURE_RE = /^failure_reason:\s*(.+)$/m;

let dirExists = false;
try {
  const s = await stat(jobsDir);
  dirExists = s.isDirectory();
} catch { /* ENOENT */ }

if (!dirExists) {
  if (json) console.log(JSON.stringify({ jobsDir, counts, jobs: [] }, null, 2));
  else console.log(`SSL queue — ${jobsDir} (디렉토리 없음, 0건)`);
  process.exit(0);
}

const glob = new Glob("**/*.job.md");
for await (const rel of glob.scan({ cwd: jobsDir })) {
  const txt = await Bun.file(resolve(jobsDir, rel)).text();
  const statusMatch = txt.match(STATUS_RE);
  const status = (statusMatch ? statusMatch[1] : "unknown").toLowerCase();
  const failureMatch = txt.match(FAILURE_RE);
  const failureReason = failureMatch ? failureMatch[1] : undefined;
  counts[status] = (counts[status] ?? 0) + 1;
  summaries.push({ file: rel, status, failureReason });
}

if (json) {
  console.log(JSON.stringify({ jobsDir, counts, jobs: summaries }, null, 2));
} else {
  console.log(`SSL queue — ${jobsDir}`);
  console.log(`pending=${counts.pending} in_progress=${counts.in_progress} done=${counts.done} failed=${counts.failed}`);
  const failed = summaries.filter((s) => s.status === "failed");
  if (failed.length > 0) {
    console.log(`\nFailed:`);
    for (const f of failed) console.log(`  - ${f.file}${f.failureReason ? ` — ${f.failureReason}` : ""}`);
  }
  if (counts.pending > 0) {
    console.log(`\n→ host LLM 처리 필요: ${counts.pending} 건. 자연어 요청 예: "memory-brain pending 작업 처리해줘"`);
  }
}
