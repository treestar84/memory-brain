#!/usr/bin/env bun
import { UsageLog } from "../src/core/stats/UsageLog";
import { FsStorage } from "../src/core/storage/FsStorage";
import { resolveStorageRoot } from "../src/hooks/bootstrap";

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

if (json) {
  console.log(JSON.stringify({ days, ...agg }, null, 2));
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
console.log(`고유 질의: ${agg.uniqueQueries}건\n`);

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
