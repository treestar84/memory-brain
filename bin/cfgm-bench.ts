#!/usr/bin/env bun
import { resolve, dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { WikiReader } from "../src/core/wiki/WikiReader";
import { SSLReader } from "../src/core/search/SSLReader";
import { SearchIndex } from "../src/core/search/SearchIndex";
import { HashedNgramEmbedder } from "../src/core/search/Embedder";
import { BenchRunner, parseBenchCases } from "../src/core/bench/BenchRunner";
import { renderBenchReport } from "../src/core/bench/report";
import type { BenchReport } from "../src/core/bench/types";

/**
 * cfgm-bench — memory quality benchmark (V3.28).
 *
 * 측정 대상:
 *   1. Router 적중률 — RouterMappings 가 실사용 phrasing 쿼리에서 기대 lane 적중
 *   2. Wiki 검색 recall@k / MRR — fts vs hybrid 비교
 *   3. Skill discovery recall@k / MRR — fts vs hybrid 비교
 *
 * 사용법:
 *   bun run bench                                # 실행 + 리포트 저장
 *   bun run bin/cfgm-bench.ts --json            # 결과 JSON stdout
 *   bun run bin/cfgm-bench.ts --cases <path>    # fixture 교체
 *   bun run bin/cfgm-bench.ts --no-report       # 리포트 파일 저장 생략
 *
 * 출력: memory/reports/benchmark-latest.md (L7 governance 표면)
 */

const repoRoot = process.env.CFGM_PROJECT_ROOT ?? process.env.CFGM_PROJECT ?? process.cwd();
const args = process.argv.slice(2);
const json = args.includes("--json");
const noReport = args.includes("--no-report");

let casesPath = resolve(repoRoot, "fixtures/bench/cases.json");
const casesIdx = args.indexOf("--cases");
if (casesIdx >= 0 && args[casesIdx + 1]) casesPath = resolve(repoRoot, args[casesIdx + 1]!);

let reportPath = resolve(repoRoot, "memory/reports/benchmark-latest.md");
const outIdx = args.indexOf("--out");
if (outIdx >= 0 && args[outIdx + 1]) reportPath = resolve(repoRoot, args[outIdx + 1]!);

const casesFile = Bun.file(casesPath);
if (!(await casesFile.exists())) {
  console.error(`bench cases not found: ${casesPath}`);
  process.exit(1);
}
const cases = parseBenchCases(await casesFile.json());

// Corpus: 실제 memory/ (wiki + SSL). 인덱스는 in-memory 파생물.
const memoryDir = resolve(repoRoot, "memory");
const wikiReader = new WikiReader(memoryDir);
const wikiPages = [];
for (const dir of ["projects", "concepts", "decisions"]) {
  for (const p of await wikiReader.readAllInDir(dir)) {
    if (p.path.split("/").some((seg) => seg.startsWith("_"))) continue;
    wikiPages.push(p);
  }
}
const sslResult = await new SSLReader(memoryDir).readAll();

const embedder = new HashedNgramEmbedder();
const index = new SearchIndex(":memory:");
index.rebuild({ wikiPages, claims: [], skills: sslResult.docs, embedder });

const runner = new BenchRunner();
const report: BenchReport = {
  generatedAt: new Date().toISOString(),
  corpus: { wikiPages: wikiPages.length, skills: sslResult.docs.length, vectorDims: embedder.dims },
  router: cases.router.length > 0 ? runner.runRouterBench(cases.router) : null,
  wiki: cases.wikiSearch.length > 0 ? runner.runWikiSearchBench(cases.wikiSearch, index, embedder) : null,
  skills:
    cases.skillSearch.length > 0 && sslResult.docs.length > 0
      ? runner.runSkillSearchBench(cases.skillSearch, index, embedder)
      : null,
};
index.close();

if (!noReport) {
  await mkdir(dirname(reportPath), { recursive: true });
  await Bun.write(reportPath, renderBenchReport(report));
}

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  console.log(`✓ memory quality benchmark (corpus: wiki ${report.corpus.wikiPages} / skills ${report.corpus.skills})`);
  if (report.router) {
    console.log(`  router  — lane hit ${pct(report.router.hitRate)} · precision ${pct(report.router.macroLanePrecision)} · recall ${pct(report.router.macroLaneRecall)}`);
  }
  for (const s of [report.wiki, report.skills]) {
    if (!s) continue;
    const fts = s.modes.find((m) => m.mode === "fts")!;
    const hyb = s.modes.find((m) => m.mode === "hybrid")!;
    console.log(`  ${s.target === "wiki" ? "wiki   " : "skills "} — recall@5 fts ${pct(fts.recallAt5)} → hybrid ${pct(hyb.recallAt5)} · MRR ${fts.mrr.toFixed(3)} → ${hyb.mrr.toFixed(3)}`);
  }
  if (!noReport) console.log(`  report  — ${reportPath}`);
}
