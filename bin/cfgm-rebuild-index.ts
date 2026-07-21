#!/usr/bin/env bun
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { WikiReader } from "../src/core/wiki/WikiReader";
import { ClaimStore } from "../src/core/claim/ClaimStore";
import { SearchIndex } from "../src/core/search/SearchIndex";
import { HashedNgramEmbedder } from "../src/core/search/Embedder";
import { Indexer } from "../src/core/search/Indexer";
import { SSLReader } from "../src/core/search/SSLReader";
import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { resolveStorageRoot, buildClaimStorage } from "../src/hooks/bootstrap";
import { AutoTrigger } from "../src/core/auto-trigger/AutoTrigger";

/**
 * cfgm-rebuild-index — markdown source 에서 SQLite FTS 인덱스 재생성 (PR-V3.6).
 *
 * 사용법:
 *   bun run bin/cfgm-rebuild-index.ts
 *   bun run bin/cfgm-rebuild-index.ts --json
 *   bun run bin/cfgm-rebuild-index.ts --embeddings   # opt-in hybrid 벡터 (V3.28)
 *
 * 입력: memory/{projects,concepts,decisions}/*.md + claims/ledger.jsonl
 * 출력: .memory-brain/indexes/search.sqlite (또는 storage root 아래 indexes/)
 */

const args = process.argv.slice(2);
const json = args.includes("--json");
const withEmbeddings = args.includes("--embeddings");

const repoRoot =
  process.env.CFGM_PROJECT_ROOT ?? process.env.CFGM_PROJECT ?? process.cwd();
const memoryDir = resolve(repoRoot, "memory");
const storageRoot = resolveStorageRoot();
const indexDir = resolve(storageRoot, "indexes");
const indexPath = resolve(indexDir, "search.sqlite");

await mkdir(indexDir, { recursive: true });

const wikiReader = new WikiReader(memoryDir);
const sslReader = new SSLReader(memoryDir);
const storage = new FsStorage(storageRoot);
const clock = new RealClock();
const claimStore = new ClaimStore(buildClaimStorage(), clock);
const searchIndex = new SearchIndex(indexPath);
const embedder = withEmbeddings ? new HashedNgramEmbedder() : undefined;
const indexer = new Indexer(wikiReader, claimStore, searchIndex, sslReader, embedder);

const result = await indexer.rebuild();
searchIndex.close();

const autoTrigger = new AutoTrigger(storage, clock);
await autoTrigger.markRun("search-index");

if (json) {
  console.log(JSON.stringify({ indexPath, ...result }, null, 2));
} else {
  console.log(`✓ rebuilt search index at ${indexPath}`);
  console.log(`  wiki pages: ${result.wikiCount}`);
  console.log(`  claims:     ${result.claimCount}`);
  console.log(`  ssl skills: ${result.skillCount ?? 0}`);
  console.log(`  embeddings: ${withEmbeddings ? "on (hybrid search enabled)" : "off"}`);
  console.log(`  duration:   ${result.durationMs}ms`);
}
