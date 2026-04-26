#!/usr/bin/env bun
import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { PromotionLedger } from "../src/core/identity/PromotionLedger";
import { resolveStorageRoot } from "../src/hooks/bootstrap";
import { PROMOTION_STATUSES, type PromotionStatus } from "../src/core/identity/types";

const args = process.argv.slice(2);
const json = args.includes("--json");
const statusIdx = args.indexOf("--status");
const status = statusIdx >= 0 ? args[statusIdx + 1] as PromotionStatus | undefined : "pending";

if (status && !PROMOTION_STATUSES.includes(status as PromotionStatus)) {
  console.error(`invalid --status: ${status}. valid: ${PROMOTION_STATUSES.join(", ")}`);
  process.exit(1);
}

const storage = new FsStorage(resolveStorageRoot());
const ledger = new PromotionLedger(storage, new RealClock());
const list = await ledger.list({ status: status as PromotionStatus | undefined });

if (json) {
  console.log(JSON.stringify(list, null, 2));
} else {
  for (const c of list) {
    console.log(`${c.candidateId}  ${c.proposedTarget}  ${c.proposedLabel}  by=${c.detectedBy}  ${c.createdAt}`);
  }
}
