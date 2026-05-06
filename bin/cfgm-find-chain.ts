#!/usr/bin/env bun
/**
 * cfgm-find-chain — goal-driven skill 체인 발견
 *
 * FTS5 ssl_skills 검색 → KGComposer COMPOSES 트리플로 관련 체인 탐색.
 * --replay: top-1 체인을 즉시 chain replay plan 으로 생성.
 *
 * Usage:
 *   bun run bin/cfgm-find-chain.ts --goal "ssl normalize 후 index rebuild"
 *   bun run bin/cfgm-find-chain.ts --goal "..." --top 5 --json
 *   bun run bin/cfgm-find-chain.ts --goal "..." --replay
 */
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { resolveStorageRoot, resolveProjectRoot } from "../src/hooks/bootstrap";
import { KGChainFinder } from "../src/core/search/KGChainFinder";
import { buildChainReplayPlan } from "./cfgm-replay";

const rawArgs = process.argv.slice(2);
const jsonMode = rawArgs.includes("--json");
const replayMode = rawArgs.includes("--replay");

const goalIdx = rawArgs.indexOf("--goal");
const topIdx = rawArgs.indexOf("--top");

if (goalIdx === -1 || !rawArgs[goalIdx + 1]) {
  console.error("Usage: cfgm-find-chain --goal \"<goal text>\" [--top N] [--json] [--replay]");
  process.exit(1);
}

const goal = rawArgs[goalIdx + 1]!;
const top = topIdx !== -1 && rawArgs[topIdx + 1] ? parseInt(rawArgs[topIdx + 1]!, 10) : 5;

const storageRoot = resolveStorageRoot();
const projectRoot = resolveProjectRoot();
const indexPath = join(storageRoot, "indexes", "search.sqlite");

if (!existsSync(indexPath)) {
  const msg = "search.sqlite not found — run cfgm-rebuild-index first";
  if (jsonMode) console.log(JSON.stringify({ error: msg }));
  else console.error(`Error: ${msg}`);
  process.exit(1);
}

const db = new Database(indexPath, { readonly: true });
let candidates;
try {
  candidates = new KGChainFinder(db).findChains(goal, { topChains: top });

  // --replay: generate chain replay plan for top-1 candidate
  if (replayMode && candidates.length > 0) {
    const top1 = candidates[0]!;
    const sslDir = resolve(projectRoot, "memory", "concepts", "_ssl");
    const result = await buildChainReplayPlan(top1.rootSlug, sslDir, db);
    const outputPath = resolve(
      projectRoot,
      "memory", "_pending", "replay",
      `${top1.rootSlug}-chain.replay.md`,
    );
    await mkdir(resolve(outputPath, ".."), { recursive: true });
    await Bun.write(outputPath, result.plan);

    if (jsonMode) {
      console.log(JSON.stringify({ goal, top1: candidates[0], replayPlan: outputPath }, null, 2));
    } else {
      console.log(`\nChain found: ${result.chain.map((c) => c.slug).join(" → ")}`);
      console.log(`Replay plan → ${outputPath}\n`);
    }
    process.exit(0);
  }
} finally {
  db.close();
}

if (jsonMode) {
  console.log(JSON.stringify({ goal, candidates }, null, 2));
  process.exit(0);
}

console.log(`\n=== Chain Discovery: "${goal}" ===\n`);

if (candidates.length === 0) {
  console.log("  No matching skill chains found.");
  console.log("  Tip: run cfgm-rebuild-index to refresh the search index.\n");
  process.exit(0);
}

for (let i = 0; i < candidates.length; i++) {
  const c = candidates[i]!;
  console.log(`#${i + 1}  root: ${c.rootSlug} — ${c.rootSkillName}`);
  console.log(`     match: ${c.matchedCount}/${c.chain.length} skills hit  |  score: ${c.totalHitScore.toFixed(2)}`);
  console.log(`     chain:`);
  for (const m of c.chain) {
    const indent = "  ".repeat(m.depth + 1);
    const hitMark = m.hitScore > 0 ? ` ★ (score ${m.hitScore.toFixed(2)})` : "";
    console.log(`     ${indent}${m.slug} — ${m.skillName}${hitMark}`);
  }
  console.log();
}

console.log(`Found ${candidates.length} chain candidate(s).\n`);
