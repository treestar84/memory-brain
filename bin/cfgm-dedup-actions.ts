#!/usr/bin/env bun
/**
 * cfgm-dedup-actions — 체인 내 중복 actionRef 탐지 보고서
 *
 * 같은 canonical actionRef 를 사용하는 LogicalNode 가 COMPOSES 체인 내
 * 여러 skill 에 걸쳐 중복 실행되는 경우를 탐지합니다.
 *
 * Usage:
 *   bun run bin/cfgm-dedup-actions.ts [--json] [--chain-only]
 */
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveStorageRoot } from "../src/hooks/bootstrap";
import { KGSharedNodeDetector } from "../src/core/search/KGSharedNodeDetector";

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const chainOnly = args.includes("--chain-only");

const indexPath = join(resolveStorageRoot(), "indexes", "search.sqlite");

if (!existsSync(indexPath)) {
  const msg = "search.sqlite not found — run cfgm-rebuild-index first";
  if (jsonMode) {
    console.log(JSON.stringify({ error: msg }));
  } else {
    console.error(`Error: ${msg}`);
  }
  process.exit(1);
}

const db = new Database(indexPath, { readonly: true });
let report;
try {
  report = new KGSharedNodeDetector(db).detect();
} finally {
  db.close();
}

const groups = chainOnly ? report.groups.filter((g) => g.inChain) : report.groups;

if (jsonMode) {
  console.log(JSON.stringify({ ...report, groups }, null, 2));
  process.exit(0);
}

console.log("\n=== Shared ActionRef Report ===\n");
console.log(`Canonical actions shared across 2+ skills: ${report.groups.length}`);
console.log(`  In-chain duplicates (execution redundancy) : ${report.inChainCount}`);
console.log(`  Cross-skill (vocabulary sharing only)      : ${report.crossSkillCount}`);

if (groups.length === 0) {
  console.log("\n  (no shared actions found)\n");
  process.exit(0);
}

console.log();
for (const g of groups) {
  const tag = g.inChain ? "⚠  IN-CHAIN" : "   shared";
  console.log(`${tag}  ${g.actionRef}  (${g.skillCount} skills)`);
  console.log(`  Skills: ${g.skills.join(", ")}`);
  if (g.chainPairs.length > 0) {
    for (const p of g.chainPairs) {
      console.log(`  Chain:  ${p.composing} COMPOSES ${p.composed} → both run [${g.actionRef}]`);
    }
  }
  console.log();
}

if (report.inChainCount > 0) {
  console.log("Action: consider extracting shared steps into a dedicated skill");
  console.log("        or use cfgm-replay --chain to skip duplicate steps.\n");
}
