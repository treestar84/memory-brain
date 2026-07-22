#!/usr/bin/env bun
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { SearchIndex } from "../src/core/search/SearchIndex";
import { HashedNgramEmbedder } from "../src/core/search/Embedder";
import { resolveStorageRoot } from "../src/hooks/bootstrap";

/**
 * cfgm-search — memory/ wiki 자연어 검색 (온보딩용 즉시 체감 진입점).
 *
 * 사용법:
 *   cfgm search "메모리 라우팅 정책"
 *   cfgm search "SSL skill 표현" --limit 5 --json
 *
 * 선행 조건: cfgm rebuild-index (인덱스 미생성 시 안내만 출력하고 종료).
 */

const args = process.argv.slice(2);
const json = args.includes("--json");
const rest = args.filter((a) => a !== "--json");

function intFlag(name: string, dflt: number): number {
  const i = rest.indexOf(name);
  if (i < 0 || !rest[i + 1]) return dflt;
  const n = Number.parseInt(rest[i + 1]!, 10);
  return Number.isFinite(n) && n > 0 ? n : dflt;
}

const limit = intFlag("--limit", 8);
const query = rest.filter((a, i) => a !== "--limit" && rest[i - 1] !== "--limit").join(" ").trim();

if (!query) {
  console.error("사용법: cfgm search \"<질의>\" [--limit N] [--json]");
  process.exit(2);
}

const storageRoot = resolveStorageRoot();
const indexPath = resolve(storageRoot, "indexes", "search.sqlite");

if (!existsSync(indexPath)) {
  console.error("검색 인덱스가 없습니다 — 먼저 실행: cfgm rebuild-index --embeddings");
  process.exit(1);
}

const index = new SearchIndex(indexPath);
const embedder = new HashedNgramEmbedder();
const hits = index.searchWikiHybrid(query, embedder, { limit });
index.close();

if (json) {
  console.log(JSON.stringify({ query, limit, hits }, null, 2));
  process.exit(0);
}

if (hits.length === 0) {
  console.log(`"${query}" — 결과 없음. 인덱스에 관련 wiki page 가 없거나 어휘가 다를 수 있습니다.`);
  process.exit(0);
}

console.log(`"${query}" — ${hits.length}건\n`);
for (const h of hits) {
  console.log(`● ${h.pageId}  [${h.type}/${h.status}]`);
  console.log(`  ${h.pagePath}`);
  console.log(`  ${h.snippet.trim()}\n`);
}
