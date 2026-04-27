#!/usr/bin/env bun
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { WikiReader } from "../src/core/wiki/WikiReader";
import { ClaimStore } from "../src/core/claim/ClaimStore";
import { SearchIndex } from "../src/core/search/SearchIndex";
import { Indexer } from "../src/core/search/Indexer";
import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { resolveStorageRoot } from "../src/hooks/bootstrap";

/**
 * cfgm-rebuild-index — markdown source 에서 SQLite FTS 인덱스 재생성 (PR-V3.6).
 *
 * 사용법:
 *   bun run bin/cfgm-rebuild-index.ts
 *   bun run bin/cfgm-rebuild-index.ts --json
 *
 * 입력: memory/{projects,concepts,decisions}/*.md + claims/ledger.jsonl
 * 출력: .memory-brain/indexes/search.sqlite (또는 storage root 아래 indexes/)
 */

const args = process.argv.slice(2);
const json = args.includes("--json");

const repoRoot =
  process.env.CFGM_PROJECT_ROOT ?? process.env.CFGM_PROJECT ?? process.cwd();
const memoryDir = resolve(repoRoot, "memory");
const storageRoot = resolveStorageRoot();
const indexDir = resolve(storageRoot, "indexes");
const indexPath = resolve(indexDir, "search.sqlite");

await mkdir(indexDir, { recursive: true });

const wikiReader = new WikiReader(memoryDir);
const storage = new FsStorage(storageRoot);
const clock = new RealClock();
const claimStore = new ClaimStore(storage, clock);
const searchIndex = new SearchIndex(indexPath);
const indexer = new Indexer(wikiReader, claimStore, searchIndex);

const result = await indexer.rebuild();
searchIndex.close();

if (json) {
  console.log(JSON.stringify({ indexPath, ...result }, null, 2));
} else {
  console.log(`✓ rebuilt search index at ${indexPath}`);
  console.log(`  wiki pages: ${result.wikiCount}`);
  console.log(`  claims:     ${result.claimCount}`);
  console.log(`  duration:   ${result.durationMs}ms`);
}
