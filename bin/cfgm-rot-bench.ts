#!/usr/bin/env bun
import { resolve, dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { createDefaultEmbedder } from "../src/core/search/Embedder";
import { parseLmeQuestions } from "../src/core/bench/LongMemEval";
import { createRotBenchAccumulator, addQuestionToRotBench, finalizeRotBenchAsync, renderRotBenchReport } from "../src/core/bench/RotBench";
import { streamTopLevelJsonArray } from "../src/core/bench/StreamingJson";
import { resolveRepoRoot } from "../src/hooks/bootstrap";

/**
 * cfgm-rot-bench — 메모리 부패(rot) 벤치마크.
 *
 * "append-only 메모리는 축적될수록 검색이 부패하고, memory-brain 의 governed
 * retrieval 은 강건하다"는 주장을 LongMemEval haystack 세션 누적 체크포인트
 * (25/50/75/100%) 로 실측한다. 결과는 있는 그대로 보고 — 유리한 방향의
 * 튜닝 상수 도입 금지 (docs/BENCHMARK.md 원칙과 동일).
 *
 * 데이터 준비 (MIT license, repo 에 커밋하지 않음):
 *   mkdir -p data/longmemeval && cd data/longmemeval
 *   curl -LO https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json
 *
 * 사용법:
 *   cfgm rot-bench                    # 전체 500 문항
 *   cfgm rot-bench -- --sample 50     # smoke run
 *   cfgm rot-bench -- --seed-order    # 날짜 재정렬 대신 데이터셋 원 순서 사용
 *   cfgm rot-bench -- --json          # 구조화 결과 전체
 *   cfgm rot-bench -- --cohort        # 코호트 모드 — 4개 체크포인트 전부에서 평가
 *                                       가능한 문항만 포함해 동일 문항 집단으로 순수
 *                                       부패 곡선을 만든다. rot-bench-latest.md 와
 *                                       별도로 rot-bench-cohort-latest.md 에 저장.
 *   cfgm rot-bench -- --consolidated  # 3번째 조건 consolidated 추가 평가 (저장 시점
 *                                       근사중복 supersede + 추출적 증류 순효과 측정).
 *                                       --cohort 와 조합 가능.
 *   cfgm rot-bench -- --adapter "<command...>" [--adapter-label <name>]
 *                                     # 외부 subprocess JSONL 어댑터를 조건으로 추가
 *                                       평가 (docs/ROT-BENCH.md §Adapter protocol).
 *                                       예: --adapter "python3 my_adapter.py"
 *                                       (command 는 최소 quote-aware 토크나이저로
 *                                       분리 — 작은/큰따옴표로 감싼 구간은 공백을
 *                                       포함해도 한 인자가 된다. 예:
 *                                       --adapter "python '/path/with space/a.py'").
 *                                       --cohort/--consolidated 와 조합 가능.
 *
 * LLM 호출 0 — docs/RULES.md 원칙 2 준수.
 */

const repoRoot = resolveRepoRoot();
const args = process.argv.slice(2);
const json = args.includes("--json");
const seedOrder = args.includes("--seed-order");
const cohort = args.includes("--cohort");
const consolidated = args.includes("--consolidated");

function strFlag(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : undefined;
}

/**
 * 최소 quote-aware 토크나이저 — `--adapter` 값(command 문자열)을 argv 로 분리한다.
 * 작은/큰따옴표로 감싼 구간은 공백을 포함해도 하나의 토큰이 되고, 따옴표 문자
 * 자체는 결과에서 제거된다. 셸의 이스케이프(`\`)나 중첩 인용은 지원하지 않는다
 * — "경로에 공백이 섞인 커맨드"를 다루기 위한 최소 구현.
 */
function tokenizeCommand(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inToken = false;
  let quote: '"' | "'" | null = null;
  for (const ch of input) {
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      inToken = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (inToken) {
        tokens.push(current);
        current = "";
        inToken = false;
      }
      continue;
    }
    current += ch;
    inToken = true;
  }
  if (inToken) tokens.push(current);
  return tokens;
}

const dataPath = resolve(repoRoot, strFlag("--data") ?? "data/longmemeval/longmemeval_s_cleaned.json");
const defaultOut = cohort ? "memory/reports/rot-bench-cohort-latest.md" : "memory/reports/rot-bench-latest.md";
const reportPath = resolve(repoRoot, strFlag("--out") ?? defaultOut);

const sampleRaw = strFlag("--sample");
const sample = sampleRaw ? Number.parseInt(sampleRaw, 10) : undefined;
if (sampleRaw && (!Number.isFinite(sample) || sample! <= 0)) {
  console.error(`invalid --sample: ${sampleRaw}`);
  process.exit(1);
}

const adapterRaw = strFlag("--adapter");
const adapterCommand = adapterRaw ? tokenizeCommand(adapterRaw) : undefined;
if (adapterRaw && (!adapterCommand || adapterCommand.length === 0)) {
  console.error(`invalid --adapter: ${adapterRaw}`);
  process.exit(1);
}
const adapterLabel = strFlag("--adapter-label") ?? adapterCommand?.[0];
const externalAdapter = adapterCommand ? { command: adapterCommand, label: adapterLabel! } : undefined;

const dataFile = Bun.file(dataPath);
if (!(await dataFile.exists())) {
  console.error(`dataset not found: ${dataPath}`);
  console.error(`download: curl -LO https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json`);
  process.exit(1);
}

// 2.5GB 급 데이터셋은 Bun.file().text()/json() 으로 전체를 문자열/객체로
// 동시에 들고 있으면 JS 문자열 상한(~2GB)을 초과해 크래시한다 (SIGTRAP,
// exit 133, 무출력). streamTopLevelJsonArray 로 원소 1건씩 읽어 즉시
// 정규화·평가하고, 질문 객체는 평가 직후 버린다 — 전체 파일을 누적하는
// 코드 경로가 없다. S 데이터셋(265MB)도 경로 이원화 없이 동일하게 처리한다.
const embedder = createDefaultEmbedder();
const acc = createRotBenchAccumulator({ embedder, order: seedOrder ? "seed" : "date", cohort, consolidated, externalAdapter });
const started = performance.now();
let seen = 0;
for await (const raw of streamTopLevelJsonArray(dataPath)) {
  if (sample && seen >= sample) break; // 조기 종료 — 남은 스트림을 읽지 않는다
  const [question] = parseLmeQuestions([raw]);
  addQuestionToRotBench(acc, question!);
  seen++;
  if (seen % 50 === 0) console.error(`  진행 ${seen}${sample ? `/${sample}` : ""}`);
}
console.error(`  진행 ${seen}${sample ? `/${sample}` : ""}`);
const result = await finalizeRotBenchAsync(acc);
const durationMs = Math.round(performance.now() - started);

const generatedAt = new Date().toISOString();
await mkdir(dirname(reportPath), { recursive: true });
await Bun.write(reportPath, renderRotBenchReport(result, generatedAt));

if (json) {
  console.log(JSON.stringify({ dataPath, durationMs, ...result }, null, 2));
} else {
  console.log(`✓ Rot Bench [mode=${result.mode}] — 총 ${result.totalQuestions}문항 (${durationMs}ms)`);
  if (result.mode === "cohort") {
    console.log(`  cohort 제외 문항 수: ${result.cohortExcluded ?? 0}`);
  }
  for (const c of result.aggregates) {
    const label = c.condition === "external" ? (result.externalLabel ?? "external") : c.condition;
    console.log(
      `  ${`${(c.checkpoint * 100).toFixed(0)}%`.padEnd(5)} ${label.padEnd(12)} n=${String(c.caseCount).padEnd(4)} R@5 ${(c.recallAt5 * 100).toFixed(1)}%  MRR ${c.mrr.toFixed(3)}  avgTok ${c.avgTop5Tokens.toFixed(0)}`,
    );
  }
  if (result.conditions.includes("external")) {
    console.log(`  adapter[${result.externalLabel}] — 오류(타임아웃/잘못된 응답/EOF) case 수: ${result.externalErrorCount ?? 0}`);
  }
  if (result.conditions.includes("consolidated") && result.consolidationByCheckpoint) {
    console.log(`  consolidation — 정답 세션 supersede 제거 case 수: ${result.answerSupersededCount ?? 0}`);
    for (const f of result.checkpoints) {
      const c = result.consolidationByCheckpoint[f]!;
      console.log(
        `    ${`${(f * 100).toFixed(0)}%`.padEnd(5)} avgSessions ${c.avgSessionsBefore.toFixed(1)}  avgSuperseded ${c.avgSuperseded.toFixed(1)}  avgCompressionRatio ${(c.avgCompressionRatio * 100).toFixed(1)}%`,
      );
    }
  }
  console.log(`  report — ${reportPath}`);
}

