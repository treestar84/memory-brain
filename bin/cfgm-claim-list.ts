#!/usr/bin/env bun
import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { ClaimStore } from "../src/core/claim/ClaimStore";
import { resolveStorageRoot } from "../src/hooks/bootstrap";
import { CLAIM_STATUSES, type ClaimStatus } from "../src/core/claim/types";

const args = process.argv.slice(2);
const json = args.includes("--json");
const statusIdx = args.indexOf("--status");
const status = statusIdx >= 0 ? (args[statusIdx + 1] as ClaimStatus | undefined) : "pending";

if (status && !CLAIM_STATUSES.includes(status as ClaimStatus)) {
  console.error(`invalid --status: ${status}. valid: ${CLAIM_STATUSES.join(", ")}`);
  process.exit(1);
}

const storage = new FsStorage(resolveStorageRoot());
const store = new ClaimStore(storage, new RealClock());
const list = await store.list({ status: status as ClaimStatus | undefined });

if (json) {
  console.log(JSON.stringify(list, null, 2));
} else {
  for (const c of list) {
    console.log(`${c.candidateId}  ${c.proposedType}  ${c.proposedText}  by=${c.detectedBy}  conf=${c.confidence}  ${c.createdAt}`);
  }
}
