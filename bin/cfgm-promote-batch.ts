#!/usr/bin/env bun
import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { PromotionLedger } from "../src/core/identity/PromotionLedger";
import { resolveStorageRoot } from "../src/hooks/bootstrap";

function parseList(arg: string | undefined): string[] {
  if (!arg) return [];
  return arg.split(",").map((s) => s.trim()).filter(Boolean);
}

const args = process.argv.slice(2);
const acceptIdx = args.indexOf("--accept");
const rejectIdx = args.indexOf("--reject");
const reasonIdx = args.indexOf("--reason");
const byIdx = args.indexOf("--by");
const force = args.includes("--force");

const acceptIds = parseList(acceptIdx >= 0 ? args[acceptIdx + 1] : undefined);
const rejectIds = parseList(rejectIdx >= 0 ? args[rejectIdx + 1] : undefined);
const reason = reasonIdx >= 0 ? args[reasonIdx + 1] : undefined;
const decidedBy = byIdx >= 0 ? args[byIdx + 1] : undefined;

if (acceptIds.length === 0 && rejectIds.length === 0) {
  console.error("usage: cfgm-promote-batch --accept ID,ID --reject ID,ID [--reason \"...\"] [--by user] [--force]");
  console.error("       --accept 또는 --reject 중 최소 하나 필수.");
  process.exit(1);
}

const storage = new FsStorage(resolveStorageRoot());
const ledger = new PromotionLedger(storage, new RealClock());

const processed: { id: string; status: "accepted" | "rejected" }[] = [];
const failed: { id: string; status: "accepted" | "rejected"; error: string }[] = [];

async function applyAll(ids: string[], status: "accepted" | "rejected"): Promise<boolean> {
  for (const id of ids) {
    try {
      await ledger.decide(id, status, { reason, decidedBy, force });
      processed.push({ id, status });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      failed.push({ id, status, error: msg });
      return false;
    }
  }
  return true;
}

let allOk = await applyAll(acceptIds, "accepted");
if (allOk) allOk = await applyAll(rejectIds, "rejected");

console.log(`처리됨: ${processed.length}건`);
for (const p of processed) console.log(`  ✓ ${p.status}: ${p.id}`);

if (failed.length > 0) {
  console.error(`\n실패: ${failed.length}건 (첫 실패 시 stop)`);
  for (const f of failed) console.error(`  ✗ ${f.status}: ${f.id} — ${f.error}`);
  console.error(`\n남은 미처리 ID는 다시 확인 후 batch 재호출.`);
  process.exit(1);
}
