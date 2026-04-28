#!/usr/bin/env bun
import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { ClaimStore } from "../src/core/claim/ClaimStore";
import { resolveStorageRoot } from "../src/hooks/bootstrap";
import type { ClaimCandidate, ClaimType } from "../src/core/claim/types";

const RISK_GROUP_SIZE = 3;

const args = process.argv.slice(2);
const json = args.includes("--json");
const typeIdx = args.indexOf("--type");
const typeFilter = typeIdx >= 0 ? (args[typeIdx + 1] as ClaimType) : undefined;
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : undefined;

const storage = new FsStorage(resolveStorageRoot());
const store = new ClaimStore(storage, new RealClock());
let pending = await store.list({ status: "pending" });
if (typeFilter) pending = pending.filter((c) => c.proposedType === typeFilter);
if (limit && limit > 0) pending = pending.slice(0, limit);

if (json) {
  console.log(JSON.stringify(pending, null, 2));
  process.exit(0);
}

if (pending.length === 0) {
  console.log("✓ pending claim 없음.");
  process.exit(0);
}

const groups = new Map<ClaimType, ClaimCandidate[]>();
for (const c of pending) {
  if (!groups.has(c.proposedType)) groups.set(c.proposedType, []);
  groups.get(c.proposedType)!.push(c);
}

console.log(`📋 Claim Review (pending ${pending.length}건)\n`);

let idx = 0;
for (const [type, items] of groups) {
  const risky = items.length >= RISK_GROUP_SIZE;
  const header = `## ${type} (${items.length}건)${risky ? " ⚠️" : ""}`;
  console.log(header);
  for (const c of items) {
    idx += 1;
    console.log(`  [${idx}] ${c.candidateId}`);
    console.log(`      ${c.proposedText}`);
    console.log(`      by=${c.detectedBy}  conf=${c.confidence}  at=${c.createdAt}`);
  }
  console.log("");
}

console.log("--");
console.log("결정 형식: accept ID,ID | reject ID,ID  (번호/ID 명시 필수)");
console.log("광범위 동의(\"다 좋아\", \"all accept\") 금지 — ADR-011 §2 정신 답습.");
console.log("");
console.log("batch 호출 예시:");
console.log("  bun run bin/cfgm-claim-batch.ts --accept <id1>,<id2> --reject <id3> --reason \"검토 완료\"");
