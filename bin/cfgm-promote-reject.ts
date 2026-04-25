#!/usr/bin/env bun
import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { PromotionLedger } from "../src/core/identity/PromotionLedger";
import { resolveStorageRoot } from "../src/hooks/bootstrap";

const args = process.argv.slice(2);
const candidateId = args[0];
if (!candidateId || candidateId.startsWith("--")) {
  console.error("usage: cfgm-promote-reject <candidateId> [--reason \"...\"] [--by user] [--force]");
  process.exit(1);
}
const reasonIdx = args.indexOf("--reason");
const reason = reasonIdx >= 0 ? args[reasonIdx + 1] : undefined;
const byIdx = args.indexOf("--by");
const decidedBy = byIdx >= 0 ? args[byIdx + 1] : undefined;
const force = args.includes("--force");

const storage = new FsStorage(resolveStorageRoot());
const ledger = new PromotionLedger(storage, new RealClock());

try {
  await ledger.decide(candidateId, "rejected", { reason, decidedBy, force });
  console.log(`rejected ${candidateId}`);
} catch (e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(msg);
  process.exit(1);
}
