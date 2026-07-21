#!/usr/bin/env bun
import { resolve, dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { HashedNgramEmbedder } from "../src/core/search/Embedder";
import {
  parseLmeQuestions,
  evalLmeRetrieval,
  renderLmeReport,
} from "../src/core/bench/LongMemEval";

/**
 * cfgm-lme-retrieval — LongMemEval retrieval-only 벤치마크 (V3.29 ①).
 *
 * 데이터 준비 (MIT license, repo 에 커밋하지 않음):
 *   mkdir -p data/longmemeval && cd data/longmemeval
 *   curl -LO https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json
 *
 * 사용법:
 *   bun run bench:lme                       # 전체 500 문항
 *   bun run bench:lme -- --limit 25         # smoke run
 *   bun run bench:lme -- --json
 *   bun run bench:lme -- --data <path> --out <report path>
 *
 * LLM 호출 0 — docs/RULES.md 원칙 2 준수. 공식 QA accuracy 트랙은
 * cfgm-lme-enqueue (host-위임) 참조.
 */

const repoRoot = process.env.CFGM_PROJECT_ROOT ?? process.env.CFGM_PROJECT ?? process.cwd();
const args = process.argv.slice(2);
const json = args.includes("--json");

function strFlag(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : undefined;
}

const dataPath = resolve(repoRoot, strFlag("--data") ?? "data/longmemeval/longmemeval_s_cleaned.json");
const reportPath = resolve(repoRoot, strFlag("--out") ?? "memory/reports/longmemeval-retrieval.md");
const limitRaw = strFlag("--limit");
const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
if (limitRaw && (!Number.isFinite(limit) || limit! <= 0)) {
  console.error(`invalid --limit: ${limitRaw}`);
  process.exit(1);
}

const dataFile = Bun.file(dataPath);
if (!(await dataFile.exists())) {
  console.error(`dataset not found: ${dataPath}`);
  console.error(`download: curl -LO https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json`);
  process.exit(1);
}

const questions = parseLmeQuestions(await dataFile.json());
const embedder = new HashedNgramEmbedder();
const started = performance.now();
const result = evalLmeRetrieval(questions, { embedder, limit });
const durationMs = Math.round(performance.now() - started);

const generatedAt = new Date().toISOString();
await mkdir(dirname(reportPath), { recursive: true });
await Bun.write(reportPath, renderLmeReport(result, generatedAt));

if (json) {
  console.log(JSON.stringify({ dataPath, durationMs, ...result }, null, 2));
} else {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  console.log(`✓ LongMemEval retrieval — ${result.evaluated} 문항 (${durationMs}ms)`);
  for (const m of result.overall) {
    console.log(
      `  ${m.mode.padEnd(6)} — ${result.ks.map((k) => `R@${k} ${pct(m.recallAtK[k] ?? 0)}`).join(" · ")} · MRR ${m.mrr.toFixed(3)}`,
    );
  }
  console.log(`  report — ${reportPath}`);
}
