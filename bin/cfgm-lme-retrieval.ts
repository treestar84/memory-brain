#!/usr/bin/env bun
import { resolveRepoRoot } from "../src/hooks/bootstrap";
import { resolve, dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { createDefaultEmbedder, HashedNgramEmbedder } from "../src/core/search/Embedder";
import {
  parseLmeQuestions,
  evalLmeRetrieval,
  renderLmeReport,
  diagnoseLmeRetrieval,
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

const repoRoot = resolveRepoRoot();
const args = process.argv.slice(2);
const json = args.includes("--json");

function strFlag(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : undefined;
}

const dataPath = resolve(repoRoot, strFlag("--data") ?? "data/longmemeval/longmemeval_s_cleaned.json");
const reportPath = resolve(repoRoot, strFlag("--out") ?? "memory/reports/longmemeval-retrieval.md");
// V3.32: held-out split · turn-level granularity · PRF 쿼리 확장
const splitRaw = strFlag("--split");
if (splitRaw && splitRaw !== "dev" && splitRaw !== "test") {
  console.error(`invalid --split: ${splitRaw} (dev|test)`);
  process.exit(1);
}
const split = splitRaw as "dev" | "test" | undefined;
const granRaw = strFlag("--granularity");
if (granRaw && granRaw !== "session" && granRaw !== "turn") {
  console.error(`invalid --granularity: ${granRaw} (session|turn)`);
  process.exit(1);
}
const granularity = granRaw as "session" | "turn" | undefined;
const prf = args.includes("--prf");
const limitRaw = strFlag("--limit");
const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
if (limitRaw && (!Number.isFinite(limit) || limit! <= 0)) {
  console.error(`invalid --limit: ${limitRaw}`);
  process.exit(1);
}

const diagnose = args.includes("--diagnose");

const dataFile = Bun.file(dataPath);
if (!(await dataFile.exists())) {
  console.error(`dataset not found: ${dataPath}`);
  console.error(`download: curl -LO https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json`);
  process.exit(1);
}

const questions = parseLmeQuestions(await dataFile.json());
// --dims: dev-split 튜닝 실험 전용 오버라이드. 프로덕션 기본값(createDefaultEmbedder)엔
// 영향 없음 — docs/BENCHMARK.md §2 규약(dev 만 사용, test 는 1회 확정)을 위한 손잡이.
const dimsRaw = strFlag("--dims");
if (dimsRaw && (!Number.isFinite(Number(dimsRaw)) || Number(dimsRaw) < 8)) {
  console.error(`invalid --dims: ${dimsRaw}`);
  process.exit(1);
}
const embedder = dimsRaw ? new HashedNgramEmbedder({ dims: Number(dimsRaw) }) : createDefaultEmbedder();

if (diagnose) {
  const started = performance.now();
  const diag = diagnoseLmeRetrieval(questions, { embedder, split, limit });
  const durationMs = Math.round(performance.now() - started);
  if (json) {
    console.log(JSON.stringify({ dataPath, durationMs, ...diag }, null, 2));
  } else {
    const pct = (n: number) => `${((n / diag.evaluated) * 100).toFixed(1)}%`;
    console.log(`✓ LongMemEval retrieval-ceiling 진단 — ${diag.evaluated} 문항, candidateLimit=${diag.candidateLimit} (${durationMs}ms)`);
    console.log(`  양쪽 후보 도달 (튜닝 대상)     — ${diag.bothReachable} (${pct(diag.bothReachable)})`);
    console.log(`  FTS 후보만 도달              — ${diag.ftsOnlyReachable} (${pct(diag.ftsOnlyReachable)})`);
    console.log(`  벡터 후보만 도달              — ${diag.vectorOnlyReachable} (${pct(diag.vectorOnlyReachable)})`);
    console.log(`  어느 쪽 후보에도 없음 (상한)   — ${diag.neitherReachable} (${pct(diag.neitherReachable)})`);
  }
  process.exit(0);
}

const started = performance.now();
const result = evalLmeRetrieval(questions, { embedder, limit, split, granularity, prf });
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
