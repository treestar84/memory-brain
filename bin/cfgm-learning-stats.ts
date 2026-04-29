#!/usr/bin/env bun
import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { LearningLedger } from "../src/core/learning/LearningLedger";
import { DetectorWeight } from "../src/core/learning/DetectorWeight";
import { resolveStorageRoot } from "../src/hooks/bootstrap";
import type { LearningLedgerKind } from "../src/core/learning/types";

/**
 * cfgm-learning-stats — detector 별 학습 통계 출력 (PR-V3.11).
 *
 * 사용법:
 *   bun run bin/cfgm-learning-stats.ts                     # 전체 detector
 *   bun run bin/cfgm-learning-stats.ts --ledger claim      # claim ledger 만
 *   bun run bin/cfgm-learning-stats.ts --detector outcome-confidence-promote
 *   bun run bin/cfgm-learning-stats.ts --json
 *
 * 출력: detectorId / accepted / rejected / superseded / invalidated / total /
 *      weight (Bayesian smoothed) / rawAcceptRate.
 */

const args = process.argv.slice(2);
const json = args.includes("--json");
const ledgerIdx = args.indexOf("--ledger");
const ledger =
  ledgerIdx >= 0 ? (args[ledgerIdx + 1] as LearningLedgerKind | undefined) : undefined;
const detectorIdx = args.indexOf("--detector");
const detectorFilter = detectorIdx >= 0 ? args[detectorIdx + 1] : undefined;

const storage = new FsStorage(resolveStorageRoot());
const learningLedger = new LearningLedger(storage, new RealClock());
const detectorWeight = new DetectorWeight(learningLedger);

const stats = detectorFilter
  ? [await detectorWeight.getStats(detectorFilter, { ledger })]
  : await detectorWeight.getAllStats({ ledger });

if (json) {
  console.log(JSON.stringify(stats, null, 2));
  process.exit(0);
}

if (stats.length === 0) {
  console.log("(학습 데이터 없음 — claim/promotion accept/reject 시점에 자동 누적됨)");
  process.exit(0);
}

console.log(`Detector Weight Stats (${stats.length} detectors)\n`);
console.log("ID                                        accept reject super invalid total weight  raw");
console.log("─".repeat(95));
for (const s of stats) {
  const id = s.detectorId.padEnd(40, " ").slice(0, 40);
  const accepted = String(s.accepted).padStart(6);
  const rejected = String(s.rejected).padStart(6);
  const superseded = String(s.superseded).padStart(5);
  const invalidated = String(s.invalidated).padStart(7);
  const total = String(s.total).padStart(5);
  const weight = s.weight.toFixed(3).padStart(6);
  const raw = s.rawAcceptRate.toFixed(3).padStart(5);
  console.log(`${id} ${accepted} ${rejected} ${superseded} ${invalidated} ${total} ${weight} ${raw}`);
}
console.log("");
console.log("weight = Bayesian smoothed accept rate (α=β=2 prior). 데이터 적을 때 0.5 근처.");
