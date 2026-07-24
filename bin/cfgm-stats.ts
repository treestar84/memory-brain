#!/usr/bin/env bun
import { resolve } from "node:path";
import { UsageLog } from "../src/core/stats/UsageLog";
import { FsStorage } from "../src/core/storage/FsStorage";
import { resolveStorageRoot } from "../src/hooks/bootstrap";
import { estimateMemoryCorpusTokens } from "../src/core/stats/TokenEstimate";

/**
 * cfgm-stats — cfgm search/ask 로컬 사용 통계 요약 (효능 지표).
 *
 * 외부 전송 없음 — <storageRoot>/stats/usage.jsonl 에서만 읽는다.
 *
 * 사용법:
 *   cfgm stats                최근 7일 요약
 *   cfgm stats --days 30      최근 30일 요약
 *   cfgm stats --json         JSON 출력
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

const days = intFlag("--days", 7);

const storageRoot = resolveStorageRoot();
const log = new UsageLog(new FsStorage(storageRoot));
const agg = await log.aggregate({ days });

// wiki 원본 위치는 cfgm-ask/cfgm-rebuild-index 와 동일한 규칙으로 해석한다 (storage root 와 다름).
const repoRoot = process.env.CFGM_PROJECT_ROOT ?? process.env.CFGM_PROJECT ?? process.cwd();
const memoryDir = resolve(repoRoot, "memory");
const corpusTokens = await estimateMemoryCorpusTokens(memoryDir);
const callCount = agg.totalSearches + agg.totalAsks;
const savingsPct =
  corpusTokens > 0 && callCount > 0
    ? Math.round((1 - agg.totalContextTokens / (callCount * corpusTokens)) * 1000) / 10
    : null;

if (json) {
  console.log(
    JSON.stringify(
      { days, ...agg, tokens: { context: agg.totalContextTokens, corpus: corpusTokens, savingsPct } },
      null,
      2,
    ),
  );
  process.exit(0);
}

const hasData = agg.totalSearches > 0 || agg.totalAsks > 0;

if (!hasData) {
  console.log(`최근 ${days}일 — 아직 사용 기록 없음. cfgm search 를 사용해 보세요.`);
  process.exit(0);
}

console.log(`cfgm 사용 통계 — 최근 ${days}일\n`);
console.log(`검색(search): ${agg.totalSearches}회`);
console.log(`질의(ask): ${agg.totalAsks}회`);
console.log(`고유 질의: ${agg.uniqueQueries}건`);
if (corpusTokens > 0 && savingsPct !== null) {
  console.log(`전달 컨텍스트: ~${agg.totalContextTokens} tokens (전량 주입 대비 ~${savingsPct}% 절감 — 추정치)`);
}
console.log("");

console.log("자주 찾은 질의:");
if (agg.topQueries.length === 0) {
  console.log("  (없음)");
} else {
  for (const q of agg.topQueries) console.log(`  ${q.count}회  ${q.query}`);
}

console.log("\n자주 매칭된 페이지:");
if (agg.topPages.length === 0) {
  console.log("  (없음)");
} else {
  for (const p of agg.topPages) console.log(`  ${p.count}회  ${p.pageId}`);
}

console.log("\n일별 추이:");
if (agg.byDay.length === 0) {
  console.log("  (없음)");
} else {
  for (const d of agg.byDay) console.log(`  ${d.date}  search=${d.searches} ask=${d.asks}`);
}
