#!/usr/bin/env bun
import { RealClock } from "../src/core/clock/Clock";
import { ClaimStore } from "../src/core/claim/ClaimStore";
import { buildClaimStorage } from "../src/hooks/bootstrap";

const args = process.argv.slice(2);
const candidateId = args[0];
if (!candidateId || candidateId.startsWith("--")) {
  console.error("usage: cfgm-claim-accept <candidateId> [--reason \"...\"] [--by user] [--force]");
  process.exit(1);
}
const reasonIdx = args.indexOf("--reason");
const reason = reasonIdx >= 0 ? args[reasonIdx + 1] : undefined;
const byIdx = args.indexOf("--by");
const decidedBy = byIdx >= 0 ? args[byIdx + 1] : undefined;
const force = args.includes("--force");

const store = new ClaimStore(buildClaimStorage(), new RealClock());

try {
  await store.decide(candidateId, "accepted", { reason, decidedBy, force });
  console.log(`accepted ${candidateId}`);
} catch (e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(msg);
  process.exit(1);
}
