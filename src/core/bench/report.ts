import type { BenchReport, RouterBenchResult, SearchBenchResult } from "./types";

/** BenchReport → memory/reports/ 용 markdown (V3.28). */
export function renderBenchReport(report: BenchReport): string {
  const lines: string[] = [
    `# Memory Quality Benchmark`,
    ``,
    `> 생성: ${report.generatedAt} · corpus: wiki ${report.corpus.wikiPages} pages / skills ${report.corpus.skills} / vector dims ${report.corpus.vectorDims}`,
    `> 실행: \`bun run bench\` (fixtures/bench/cases.json). 수치는 실제 memory/ 코퍼스 대상 측정값.`,
    ``,
  ];

  if (report.router) lines.push(...renderRouter(report.router));
  if (report.wiki) lines.push(...renderSearch(report.wiki, "Wiki 검색"));
  if (report.skills) lines.push(...renderSearch(report.skills, "Skill discovery"));

  return lines.join("\n");
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function renderRouter(r: RouterBenchResult): string[] {
  const lines = [
    `## Router 적중률 (RouterMappings.resolve)`,
    ``,
    `| 지표 | 값 |`,
    `|---|---|`,
    `| lane hit rate (기대 lane 전부 포함) | ${pct(r.hitRate)} (${r.cases.filter((c) => c.laneHit).length}/${r.caseCount}) |`,
    `| macro lane precision | ${pct(r.macroLanePrecision)} |`,
    `| macro lane recall | ${pct(r.macroLaneRecall)} |`,
  ];
  if (r.fileHitRate !== null) lines.push(`| file hit rate | ${pct(r.fileHitRate)} |`);
  lines.push(``);

  const misses = r.cases.filter((c) => !c.laneHit);
  if (misses.length > 0) {
    lines.push(`### Miss 케이스 (튜닝 대상)`, ``);
    for (const m of misses) {
      lines.push(`- \`${m.id}\` "${m.query}" — 기대 [${m.expectLanes.join(", ")}] vs 실제 [${m.actualLanes.join(", ")}]`);
    }
    lines.push(``);
  }
  return lines;
}

function renderSearch(r: SearchBenchResult, title: string): string[] {
  const lines = [
    `## ${title} recall (fts vs hybrid)`,
    ``,
    `| mode | recall@1 | recall@3 | recall@5 | MRR |`,
    `|---|---|---|---|---|`,
  ];
  for (const m of r.modes) {
    lines.push(`| ${m.mode} | ${pct(m.recallAt1)} | ${pct(m.recallAt3)} | ${pct(m.recallAt5)} | ${m.mrr.toFixed(3)} |`);
  }
  lines.push(``);

  const fts = r.modes.find((m) => m.mode === "fts");
  const hybrid = r.modes.find((m) => m.mode === "hybrid");
  if (fts && hybrid) {
    const delta = hybrid.recallAt5 - fts.recallAt5;
    lines.push(
      `hybrid 효과 (recall@5): ${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(1)}pp — ${
        delta > 0 ? "개선" : delta < 0 ? "퇴행 (원인 조사 필요)" : "동일"
      }`,
      ``,
    );
    const rescued = hybrid.cases.filter((c) => {
      const f = fts.cases.find((x) => x.id === c.id);
      return f && f.firstRelevantRank === null && c.firstRelevantRank !== null;
    });
    if (rescued.length > 0) {
      lines.push(`### hybrid 가 구제한 케이스 (fts 0건 → hybrid 적중)`, ``);
      for (const c of rescued) lines.push(`- \`${c.id}\` "${c.query}" → rank ${c.firstRelevantRank}`);
      lines.push(``);
    }
    const lost = hybrid.cases.filter((c) => c.firstRelevantRank === null);
    if (lost.length > 0) {
      lines.push(`### 미적중 케이스 (양 모드 공통 포함)`, ``);
      for (const c of lost) lines.push(`- \`${c.id}\` "${c.query}"`);
      lines.push(``);
    }
  }
  return lines;
}
