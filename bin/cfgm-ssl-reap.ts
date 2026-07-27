#!/usr/bin/env bun
import { Glob } from "bun";
import { resolve } from "node:path";
import { stat } from "node:fs/promises";
import { reapJob } from "../src/core/normalizer/JobLifecycle";
import { resolveRepoRoot } from "../src/hooks/bootstrap";

/**
 * cfgm-ssl-reap — orphan in_progress job 회수 (V3.28 실패 시맨틱).
 *
 * host LLM 이 job 을 claim (status: in_progress) 한 채 세션이 죽으면 job 이
 * 영구 고아가 된다. 본 CLI 가 lease 만료된 in_progress job 을:
 *   - attempts < max_attempts → pending 재큐
 *   - attempts ≥ max_attempts → failed (failure_reason 기록)
 *
 * 사용법:
 *   bun run bin/cfgm-ssl-reap.ts                 # 회수 실행
 *   bun run bin/cfgm-ssl-reap.ts --dry-run       # 판정만 출력, 파일 무변경
 *   bun run bin/cfgm-ssl-reap.ts --ttl-minutes 30
 *   bun run bin/cfgm-ssl-reap.ts --max-attempts 5
 *   bun run bin/cfgm-ssl-reap.ts --json
 */

const repoRoot = resolveRepoRoot();
const args = process.argv.slice(2);
const json = args.includes("--json");
const dryRun = args.includes("--dry-run");

function intFlag(name: string): number | undefined {
  const i = args.indexOf(name);
  if (i < 0 || !args[i + 1]) return undefined;
  const v = Number.parseInt(args[i + 1]!, 10);
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

const ttlMinutes = intFlag("--ttl-minutes");
const maxAttempts = intFlag("--max-attempts");
const jobsDir = resolve(repoRoot, "memory/_pending/normalize/jobs");
const nowIso = new Date().toISOString();

interface ReapEntry {
  file: string;
  action: string;
  reason?: string;
}

const entries: ReapEntry[] = [];
const counts = { scanned: 0, requeued: 0, failed: 0, untouched: 0 };

let dirExists = false;
try {
  dirExists = (await stat(jobsDir)).isDirectory();
} catch { /* ENOENT */ }

if (dirExists) {
  const glob = new Glob("**/*.job.md");
  for await (const rel of glob.scan({ cwd: jobsDir })) {
    counts.scanned++;
    const fullPath = resolve(jobsDir, rel);
    const text = await Bun.file(fullPath).text();
    const mtime = (await stat(fullPath)).mtime.toISOString();
    const decision = reapJob(text, { nowIso, ttlMinutes, maxAttempts, fileMtimeIso: mtime });

    if (decision.action === "none") {
      counts.untouched++;
      continue;
    }
    if (!dryRun && decision.text) await Bun.write(fullPath, decision.text);
    if (decision.action === "requeued") counts.requeued++;
    else counts.failed++;
    entries.push({ file: rel, action: decision.action, reason: decision.reason });
  }
}

if (json) {
  console.log(JSON.stringify({ jobsDir, nowIso, dryRun, ...counts, entries }, null, 2));
} else {
  console.log(`SSL reap — ${jobsDir}${dryRun ? " (dry-run)" : ""}`);
  console.log(`scanned=${counts.scanned} requeued=${counts.requeued} failed=${counts.failed} untouched=${counts.untouched}`);
  for (const e of entries) console.log(`  - ${e.file}: ${e.action}${e.reason ? ` — ${e.reason}` : ""}`);
  if (counts.requeued > 0) {
    console.log(`\n→ ${counts.requeued} 건 pending 재큐 — host LLM 처리 필요.`);
  }
}
