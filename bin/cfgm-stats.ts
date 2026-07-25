#!/usr/bin/env bun
import { resolve } from "node:path";
import { UsageLog } from "../src/core/stats/UsageLog";
import { FsStorage } from "../src/core/storage/FsStorage";
import { resolveStorageRoot } from "../src/hooks/bootstrap";
import { estimateMemoryCorpusTokens } from "../src/core/stats/TokenEstimate";
import { t } from "../src/core/i18n/messages";

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
  console.log(t("stats.noData", days));
  process.exit(0);
}

console.log(t("stats.header", days));
console.log(t("stats.searchCount", agg.totalSearches));
console.log(t("stats.askCount", agg.totalAsks));
console.log(t("stats.uniqueQueries", agg.uniqueQueries));
if (corpusTokens > 0 && savingsPct !== null) {
  console.log(t("stats.contextLine", agg.totalContextTokens, savingsPct));
}
console.log("");

console.log(t("stats.topQueriesLabel"));
if (agg.topQueries.length === 0) {
  console.log(t("stats.none"));
} else {
  for (const q of agg.topQueries) console.log(t("stats.topQueryLine", q.count, q.query));
}

console.log(t("stats.topPagesLabel"));
if (agg.topPages.length === 0) {
  console.log(t("stats.none"));
} else {
  for (const p of agg.topPages) console.log(t("stats.topPageLine", p.count, p.pageId));
}

console.log(t("stats.dailyTrendLabel"));
if (agg.byDay.length === 0) {
  console.log(t("stats.none"));
} else {
  for (const d of agg.byDay) console.log(`  ${d.date}  search=${d.searches} ask=${d.asks}`);
}
