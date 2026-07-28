#!/usr/bin/env bun
import { resolveStorageRoot, resolveRepoRoot } from "../src/hooks/bootstrap";
import { summarizeCaptureQueue } from "../src/core/capture/CaptureStatus";

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

const summary = await summarizeCaptureQueue(repoRoot, resolveStorageRoot());
const { locations, counts: totalCounts, drafts: allDrafts } = summary;

if (json) {
  console.log(JSON.stringify(summary, null, 2));
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
