#!/usr/bin/env bun
import { Glob } from "bun";
import { resolve } from "node:path";
import { stat } from "node:fs/promises";
import { parseJob, isStale } from "../src/core/normalizer/JobLifecycle";
import { resolveRepoRoot } from "../src/hooks/bootstrap";

/**
 * cfgm-ssl-status — pending normalize queue 상태 보기.
 *
 * 사용법:
 *   bun run bin/cfgm-ssl-status.ts
 *   bun run bin/cfgm-ssl-status.ts --json
 *
 * 출력: pending / in_progress / done / failed 카운트 + 실패 항목 목록 +
 * stale (lease 만료 in_progress, V3.28) 카운트. stale > 0 이면 cfgm-ssl-reap 권고.
 */

const repoRoot = resolveRepoRoot();
const json = process.argv.includes("--json");
const jobsDir = resolve(repoRoot, "memory/_pending/normalize/jobs");

interface JobSummary {
  file: string;
  status: string;
  attempts?: number;
  stale?: boolean;
  failureReason?: string;
}

const summaries: JobSummary[] = [];
const counts: Record<string, number> = { pending: 0, in_progress: 0, done: 0, failed: 0, unknown: 0 };
let staleCount = 0;
const nowIso = new Date().toISOString();

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
  const fullPath = resolve(jobsDir, rel);
  const txt = await Bun.file(fullPath).text();
  const statusMatch = txt.match(STATUS_RE);
  const status = (statusMatch ? statusMatch[1] : "unknown").toLowerCase();
  const failureMatch = txt.match(FAILURE_RE);
  const failureReason = failureMatch ? failureMatch[1] : undefined;
  counts[status] = (counts[status] ?? 0) + 1;

  // stale 판정 (V3.28) — lease 만료 in_progress. legacy job 은 mtime 기준.
  const parsed = parseJob(txt);
  let stale: boolean | undefined;
  let attempts: number | undefined;
  if (parsed) {
    attempts = parsed.frontmatter.attempts;
    const mtime = (await stat(fullPath)).mtime.toISOString();
    stale = isStale(parsed.frontmatter, nowIso, mtime);
    if (stale) staleCount++;
  }
  summaries.push({ file: rel, status, attempts, stale, failureReason });
}

if (json) {
  console.log(JSON.stringify({ jobsDir, counts, stale: staleCount, jobs: summaries }, null, 2));
} else {
  console.log(`SSL queue — ${jobsDir}`);
  console.log(`pending=${counts.pending} in_progress=${counts.in_progress} done=${counts.done} failed=${counts.failed} stale=${staleCount}`);
  if (staleCount > 0) {
    console.log(`\n→ stale in_progress ${staleCount} 건 — 'bun run bin/cfgm-ssl-reap.ts' 로 회수하세요.`);
  }
  const failed = summaries.filter((s) => s.status === "failed");
  if (failed.length > 0) {
    console.log(`\nFailed:`);
    for (const f of failed) console.log(`  - ${f.file}${f.failureReason ? ` — ${f.failureReason}` : ""}`);
  }
  if (counts.pending > 0) {
    console.log(`\n→ host LLM 처리 필요: ${counts.pending} 건. 자연어 요청 예: "memory-brain pending 작업 처리해줘"`);
  }
}
