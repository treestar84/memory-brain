#!/usr/bin/env bun
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { SearchIndex } from "../src/core/search/SearchIndex";
import { HashedNgramEmbedder } from "../src/core/search/Embedder";
import { resolveStorageRoot } from "../src/hooks/bootstrap";
import { UsageLog } from "../src/core/stats/UsageLog";
import { FsStorage } from "../src/core/storage/FsStorage";
import { estimateTokens, estimateMemoryCorpusTokens } from "../src/core/stats/TokenEstimate";

/**
 * cfgm-ask — evidence pointer 가 붙은 근거 번들을 생성하는 프롬프트 컴포저.
 *
 * memory-brain 은 LLM 을 직접 호출하지 않는다 (docs/RULES.md 원칙 2). 본 커맨드는
 * cfgm search 와 동일한 hybrid 검색으로 top-K wiki page 를 찾은 뒤, 각 page 에서
 * claim id 를 추출해 "근거 + 인용 지시" 번들을 만들 뿐이다. 실제 답변 생성은
 * 이 커맨드를 실행한 host CLI 세션(Claude Code/Codex)의 LLM 이 담당한다.
 *
 * 사용법:
 *   cfgm ask "메모리 라우팅 정책이 뭐야?"
 *   cfgm ask "SSL skill 표현" --limit 5 --json
 *
 * 선행 조건: cfgm rebuild-index --embeddings (인덱스 미생성 시 안내만 출력하고 종료).
 */

const CLAIM_ID_RE = /<!--\s*claim:(cl-[a-zA-Z0-9-]+)\s*-->/g;

const args = process.argv.slice(2);
const json = args.includes("--json");
const rest = args.filter((a) => a !== "--json");

function intFlag(name: string, dflt: number): number {
  const i = rest.indexOf(name);
  if (i < 0 || !rest[i + 1]) return dflt;
  const n = Number.parseInt(rest[i + 1]!, 10);
  return Number.isFinite(n) && n > 0 ? n : dflt;
}

const limit = intFlag("--limit", 5);
const query = rest.filter((a, i) => a !== "--limit" && rest[i - 1] !== "--limit").join(" ").trim();

if (!query) {
  console.error("사용법: cfgm ask \"<질의>\" [--limit N] [--json]");
  process.exit(2);
}

const storageRoot = resolveStorageRoot();
const indexPath = resolve(storageRoot, "indexes", "search.sqlite");

if (!existsSync(indexPath)) {
  console.error("검색 인덱스가 없습니다 — 먼저 실행: cfgm rebuild-index --embeddings");
  process.exit(1);
}

// wiki 원본 위치는 rebuild-index 와 동일한 규칙으로 해석한다 (storage root 와 다름).
const repoRoot =
  process.env.CFGM_PROJECT_ROOT ?? process.env.CFGM_PROJECT ?? process.cwd();
const memoryDir = resolve(repoRoot, "memory");

const index = new SearchIndex(indexPath);
const embedder = new HashedNgramEmbedder();
const hits = index.searchWikiHybrid(query, embedder, { limit });
index.close();

async function extractClaimIds(pagePath: string): Promise<string[]> {
  const fullPath = resolve(memoryDir, pagePath);
  const file = Bun.file(fullPath);
  if (!(await file.exists())) return [];
  const text = await file.text();
  const ids: string[] = [];
  for (const m of text.matchAll(CLAIM_ID_RE)) ids.push(m[1]!);
  return ids;
}

interface Ground {
  pageId: string;
  pagePath: string;
  type: string;
  status: string;
  snippet: string;
  claimIds: string[];
}

const grounds: Ground[] = [];
for (const h of hits) {
  const claimIds = await extractClaimIds(h.pagePath);
  grounds.push({
    pageId: h.pageId,
    pagePath: h.pagePath,
    type: h.type,
    status: h.status,
    snippet: h.snippet.trim(),
    claimIds,
  });
}

const instruction =
  `위 근거만 사용해 질문에 답하라. 각 주장 끝에 (근거: <pageId> / <claim-id>) 형식의 ` +
  `pointer 를 인용하라. 위 근거로 답할 수 없으면 추측하지 말고 '메모리에 근거 없음' 이라고 답하라. ` +
  `질문: ${query}`;

// 근거 번들 텍스트(실제로 host LLM 에게 전달되는 부분) 를 조립해 토큰 추정에 사용한다.
const bundleLines: string[] = [];
if (grounds.length === 0) {
  bundleLines.push(`"${query}" — 근거 없음. 인덱스에 관련 wiki page 가 없거나 어휘가 다를 수 있습니다.`);
} else {
  bundleLines.push(`질의: "${query}" — 근거 ${grounds.length}건\n`);
  for (const g of grounds) {
    bundleLines.push(`● ${g.pageId}  [${g.type}/${g.status}]`);
    bundleLines.push(`  ${g.pagePath}`);
    bundleLines.push(`  ${g.snippet}`);
    bundleLines.push(`  claims: ${g.claimIds.length > 0 ? g.claimIds.join(", ") : "(없음)"}\n`);
  }
  bundleLines.push(instruction);
}
const bundleText = bundleLines.join("\n");

const bundleTokens = estimateTokens(bundleText);
const corpusTokens = await estimateMemoryCorpusTokens(memoryDir);
const pct = corpusTokens > 0 ? Math.round((bundleTokens / corpusTokens) * 1000) / 10 : null;

await new UsageLog(new FsStorage(storageRoot)).record({
  tool: "ask",
  query,
  hits: grounds.length,
  topPageIds: grounds.slice(0, 5).map((g) => g.pageId),
  ts: new Date().toISOString(),
  contextTokens: bundleTokens,
});

if (json) {
  console.log(
    JSON.stringify(
      { query, limit, grounds, instruction, tokens: { bundle: bundleTokens, corpus: corpusTokens, pct } },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (grounds.length === 0) {
  console.log(`"${query}" — 근거 없음. 인덱스에 관련 wiki page 가 없거나 어휘가 다를 수 있습니다.`);
  process.exit(0);
}

console.log(`질의: "${query}" — 근거 ${grounds.length}건\n`);
for (const g of grounds) {
  console.log(`● ${g.pageId}  [${g.type}/${g.status}]`);
  console.log(`  ${g.pagePath}`);
  console.log(`  ${g.snippet}`);
  console.log(`  claims: ${g.claimIds.length > 0 ? g.claimIds.join(", ") : "(없음)"}\n`);
}

console.log(instruction);

if (corpusTokens > 0) {
  console.log(
    `\n--- 근거 번들 ~${bundleTokens} tokens · 전체 메모리 ~${corpusTokens} tokens 의 ${pct}% (추정: chars/4)`,
  );
}
