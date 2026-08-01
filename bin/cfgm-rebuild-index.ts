#!/usr/bin/env bun
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { WikiReader } from "../src/core/wiki/WikiReader";
import { ClaimStore } from "../src/core/claim/ClaimStore";
import { SearchIndex } from "../src/core/search/SearchIndex";
import { createDefaultEmbedder } from "../src/core/search/Embedder";
import { Indexer } from "../src/core/search/Indexer";
import { SSLReader } from "../src/core/search/SSLReader";
import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { resolveStorageRoot, buildClaimStorage, resolveRepoRoot } from "../src/hooks/bootstrap";
import { AutoTrigger } from "../src/core/auto-trigger/AutoTrigger";

/**
 * cfgm-rebuild-index — markdown source 에서 SQLite FTS 인덱스 재생성 (PR-V3.6).
 *
 * 사용법:
 *   bun run bin/cfgm-rebuild-index.ts                 # 하이브리드(FTS+벡터) 기본
 *   bun run bin/cfgm-rebuild-index.ts --json
 *   bun run bin/cfgm-rebuild-index.ts --no-embeddings # lexical(FTS)-only, 더 가벼움
 *
 * V3.43: 기본값을 하이브리드로 전환(이전엔 --embeddings 로 opt-in). 실효성 검증
 * 시뮬레이션에서 블라인드 인수인계자가 도메인 어휘를 모르는 자연어 질의("왜 지금
 * 이런 구조인가")를 했을 때 FTS-only 인덱스는 0건이었는데, 하이브리드 인덱스는
 * 같은 질의를 벡터 유사도로 구제해 정답 페이지를 찾았다(재현 확인됨). 의존성 0의
 * 결정론적 n-gram 벡터라이저라 비용이 낮아(docs/RULES.md 원칙 2 — LLM API 미호출)
 * 기본으로 켜도 안전하다고 판단.
 *
 * 입력: memory/{projects,concepts,decisions}/*.md + claims/ledger.jsonl
 * 출력: .memory-brain/indexes/search.sqlite (또는 storage root 아래 indexes/)
 */

const args = process.argv.slice(2);
const json = args.includes("--json");
const withEmbeddings = !args.includes("--no-embeddings");

const repoRoot =
  resolveRepoRoot();
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
const embedder = withEmbeddings ? createDefaultEmbedder() : undefined;
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
