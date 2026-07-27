#!/usr/bin/env bun
import { resolveRepoRoot } from "../src/hooks/bootstrap";
import { Glob } from "bun";
import { resolve, dirname } from "node:path";
import { mkdir, stat } from "node:fs/promises";
import { parseLmeQuestions } from "../src/core/bench/LongMemEval";
import {
  parseLmeAnswer,
  parseLmeJudgment,
  scoreAnswerProxy,
  buildJudgeJob,
  aggregateQa,
  type LmeProxyScore,
} from "../src/core/bench/LmeQa";

/**
 * cfgm-lme-score — LongMemEval QA 채점 (V3.29 ②).
 *
 * 모드:
 *   (기본)            answers/ 의 답변을 proxy 지표 (EM / contains / token-F1) 로 채점
 *   --judge-enqueue   답변마다 judge job 생성 (host LLM 이 공식 semantic 판정)
 *   --collect         judgments/ 수집 → 공식 지표 (judge accuracy) 포함 리포트
 *
 * proxy 지표는 참고용 — 공식 LongMemEval 지표는 LLM judge accuracy 다.
 * 리포트: memory/reports/longmemeval-qa.md
 */

const repoRoot = resolveRepoRoot();
const args = process.argv.slice(2);
const json = args.includes("--json");
const judgeEnqueue = args.includes("--judge-enqueue");
const collect = args.includes("--collect");

function strFlag(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : undefined;
}

const dataPath = resolve(repoRoot, strFlag("--data") ?? "data/longmemeval/longmemeval_s_cleaned.json");
const answersDir = resolve(repoRoot, "memory/_pending/lme/answers");
const judgeJobsDir = resolve(repoRoot, "memory/_pending/lme/judge-jobs");
const judgmentsDir = resolve(repoRoot, "memory/_pending/lme/judgments");
const judgmentsDirRel = "memory/_pending/lme/judgments";
const reportPath = resolve(repoRoot, strFlag("--out") ?? "memory/reports/longmemeval-qa.md");

const dataFile = Bun.file(dataPath);
if (!(await dataFile.exists())) {
  console.error(`dataset not found: ${dataPath}`);
  process.exit(1);
}
const questions = parseLmeQuestions(await dataFile.json());
const byId = new Map(questions.map((q) => [q.question_id, q]));

async function dirExists(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

// 1) answers 수집 + proxy 채점
const scores: LmeProxyScore[] = [];
const answersById = new Map<string, string>();
if (await dirExists(answersDir)) {
  const glob = new Glob("*.json");
  for await (const rel of glob.scan({ cwd: answersDir })) {
    let parsed: unknown;
    try {
      parsed = await Bun.file(resolve(answersDir, rel)).json();
    } catch {
      continue; // 손상 파일 — PAI 재처리 대상
    }
    const ans = parseLmeAnswer(parsed);
    if (!ans) continue;
    const q = byId.get(ans.question_id);
    if (!q) continue;
    answersById.set(ans.question_id, ans.answer);
    scores.push(scoreAnswerProxy(q, ans.answer));
  }
}

// 2) --judge-enqueue: judge job 생성 (이미 있으면 skip)
let judgeCreated = 0;
if (judgeEnqueue) {
  await mkdir(judgeJobsDir, { recursive: true });
  await mkdir(judgmentsDir, { recursive: true });
  for (const [qid, answer] of answersById) {
    const jobPath = resolve(judgeJobsDir, `${qid}.job.md`);
    if (await Bun.file(jobPath).exists()) continue;
    await Bun.write(jobPath, buildJudgeJob(byId.get(qid)!, answer, judgmentsDirRel));
    judgeCreated++;
  }
}

// 3) --collect: judgments 수집
const judgments = new Map<string, boolean>();
if (collect && (await dirExists(judgmentsDir))) {
  const glob = new Glob("*.json");
  for await (const rel of glob.scan({ cwd: judgmentsDir })) {
    let parsed: unknown;
    try {
      parsed = await Bun.file(resolve(judgmentsDir, rel)).json();
    } catch {
      continue;
    }
    const j = parseLmeJudgment(parsed);
    if (j) judgments.set(j.question_id, j.correct);
  }
}

const agg = aggregateQa(scores, judgments, questions.length);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const generatedAt = new Date().toISOString();

const reportLines = [
  `# LongMemEval QA Benchmark (host-delegated)`,
  ``,
  `> 생성: ${generatedAt} · 답변 ${agg.answered}/${agg.total} · judge 판정 ${agg.judgedCount}`,
  `> proxy 지표 (EM/contains/F1) 는 참고용 — **공식 지표는 judge accuracy**.`,
  ``,
  `| 지표 | 값 |`,
  `|---|---|`,
  `| answered | ${agg.answered}/${agg.total} |`,
  `| exact match (proxy) | ${pct(agg.exactMatch)} |`,
  `| contains match (proxy) | ${pct(agg.containsMatch)} |`,
  `| mean token-F1 (proxy) | ${agg.meanF1.toFixed(3)} |`,
  `| **judge accuracy (공식)** | ${agg.judgeAccuracy === null ? "(미수집 — --judge-enqueue 후 PAI 처리 → --collect)" : pct(agg.judgeAccuracy)} |`,
  ``,
  `## Question type 별`,
  ``,
  `| type | n | mean F1 | judge acc |`,
  `|---|---|---|---|`,
  ...agg.byType.map(
    (t) => `| ${t.questionType} | ${t.count} | ${t.meanF1.toFixed(3)} | ${t.judgeAccuracy === null ? "—" : pct(t.judgeAccuracy)} |`,
  ),
  ``,
];
await mkdir(dirname(reportPath), { recursive: true });
await Bun.write(reportPath, reportLines.join("\n"));

if (json) {
  console.log(JSON.stringify({ generatedAt, judgeCreated, ...agg }, null, 2));
} else {
  console.log(`✓ LongMemEval QA score — answered ${agg.answered}/${agg.total}`);
  console.log(`  proxy — EM ${pct(agg.exactMatch)} · contains ${pct(agg.containsMatch)} · F1 ${agg.meanF1.toFixed(3)}`);
  console.log(`  judge — ${agg.judgeAccuracy === null ? `미수집 (판정 ${agg.judgedCount}건)` : `accuracy ${pct(agg.judgeAccuracy)} (${agg.judgedCount}건)`}`);
  if (judgeEnqueue) console.log(`  judge jobs created: ${judgeCreated} → PAI 세션 처리 후 --collect`);
  console.log(`  report — ${reportPath}`);
}
