#!/usr/bin/env bun
import { resolve } from "node:path";
import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { ClaimStore } from "../src/core/claim/ClaimStore";
import { WikiReader } from "../src/core/wiki/WikiReader";
import { ReportWriter } from "../src/core/governance/reports/ReportWriter";
import { DuplicateCandidatesDetector } from "../src/core/governance/reports/DuplicateCandidatesDetector";
import { StaleClaimsDetector } from "../src/core/governance/reports/StaleClaimsDetector";
import { ContradictionsDetector } from "../src/core/governance/reports/ContradictionsDetector";
import { LowConfidenceDetector } from "../src/core/governance/reports/LowConfidenceDetector";
import { ReviewQueueDetector } from "../src/core/governance/reports/ReviewQueueDetector";
import { resolveStorageRoot, buildClaimStorage, resolveRepoRoot } from "../src/hooks/bootstrap";
import { AutoTrigger } from "../src/core/auto-trigger/AutoTrigger";
import type { GovernanceDetector, GovernanceInput } from "../src/core/governance/reports/types";

/**
 * cfgm-governance-report — 5 detector 실행 → reports/<id>.md 작성 (PR-V3.7).
 *
 * 사용법:
 *   bun run bin/cfgm-governance-report.ts
 *   bun run bin/cfgm-governance-report.ts --json
 */

const args = process.argv.slice(2);
const json = args.includes("--json");

const repoRoot =
  resolveRepoRoot();
const memoryDir = resolve(repoRoot, "memory");
const storageRoot = resolveStorageRoot();

const storage = new FsStorage(storageRoot);
const clock = new RealClock();
const claimStore = new ClaimStore(buildClaimStorage(), clock);
const wikiReader = new WikiReader(memoryDir);
const writer = new ReportWriter(storage);

const detectors: GovernanceDetector[] = [
  new DuplicateCandidatesDetector(),
  new StaleClaimsDetector(),
  new ContradictionsDetector(),
  new LowConfidenceDetector(),
  new ReviewQueueDetector(),
];

const claims = await claimStore.list();
const wikiPages = [];
for (const dir of ["projects", "concepts", "decisions"]) {
  wikiPages.push(...(await wikiReader.readAllInDir(dir)));
}

const input: GovernanceInput = { claims, wikiPages, now: clock.isoNow() };

const summary: Array<{ id: string; findings: number; path: string }> = [];
for (const d of detectors) {
  const report = d.detect(input);
  const path = await writer.write(report);
  summary.push({ id: d.id, findings: report.findings.length, path });
}

const autoTrigger = new AutoTrigger(storage, clock);
await autoTrigger.markRun("governance");

if (json) {
  console.log(JSON.stringify({ summary }, null, 2));
} else {
  console.log(`✓ governance reports written to ${storageRoot}/reports/\n`);
  for (const s of summary) {
    const marker = s.findings === 0 ? "  ✓" : "  ⚠";
    console.log(`${marker} ${s.id}: ${s.findings} findings`);
  }
}
