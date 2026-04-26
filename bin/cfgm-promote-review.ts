#!/usr/bin/env bun
import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { PromotionLedger } from "../src/core/identity/PromotionLedger";
import { resolveStorageRoot } from "../src/hooks/bootstrap";
import type { PromotedCandidate, IdentityTarget } from "../src/core/identity/types";

const RISK_GROUP_SIZE = 3;

const args = process.argv.slice(2);
const json = args.includes("--json");
const targetIdx = args.indexOf("--target");
const targetFilter = targetIdx >= 0 ? args[targetIdx + 1] as IdentityTarget : undefined;
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : undefined;

const storage = new FsStorage(resolveStorageRoot());
const ledger = new PromotionLedger(storage, new RealClock());
let pending = await ledger.list({ status: "pending" });
if (targetFilter) pending = pending.filter((c) => c.proposedTarget === targetFilter);
if (limit && limit > 0) pending = pending.slice(0, limit);

if (json) {
  console.log(JSON.stringify(pending, null, 2));
  process.exit(0);
}

if (pending.length === 0) {
  console.log("✓ pending 후보 없음.");
  process.exit(0);
}

const groups = new Map<IdentityTarget, PromotedCandidate[]>();
for (const c of pending) {
  if (!groups.has(c.proposedTarget)) groups.set(c.proposedTarget, []);
  groups.get(c.proposedTarget)!.push(c);
}

console.log(`📋 Promotion Review (pending ${pending.length}건)\n`);

let idx = 0;
for (const [target, items] of groups) {
  const risky = items.length >= RISK_GROUP_SIZE;
  const header = `## ${target} (${items.length}건)${risky ? " ⚠️" : ""}`;
  console.log(header);
  for (const c of items) {
    idx += 1;
    const metrics = JSON.stringify(c.metrics);
    console.log(`  [${idx}] ${c.candidateId}`);
    console.log(`      ${c.proposedLabel}`);
    console.log(`      by=${c.detectedBy}  metrics=${metrics}  at=${c.createdAt}`);
  }
  console.log("");
}

console.log("--");
console.log("결정 형식: accept ID,ID | reject ID,ID  (번호/ID 명시 필수)");
console.log("광범위 동의(\"다 좋아\", \"all accept\") 금지 — ADR-011 §2.");
console.log("");
console.log("batch 호출 예시:");
console.log("  bun run bin/cfgm-promote-batch.ts --accept <id1>,<id2> --reject <id3> --reason \"검토 완료\"");
