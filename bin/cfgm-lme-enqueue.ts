#!/usr/bin/env bun
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { HashedNgramEmbedder } from "../src/core/search/Embedder";
import { SearchIndex } from "../src/core/search/SearchIndex";
import { parseLmeQuestions, sessionToText } from "../src/core/bench/LongMemEval";
import { buildAnswerJob } from "../src/core/bench/LmeQa";
import type { WikiPage } from "../src/core/wiki/types";

/**
 * cfgm-lme-enqueue — LongMemEval 풀 QA 트랙: answer job 생성 (V3.29 ②).
 *
 * 질문별 retrieval (hybrid rescue, top-k) → 컨텍스트 포함 answer job 을
 * `memory/_pending/lme/jobs/` 에 생성. host LLM (PAI 세션) 이 처리한다.
 * ground truth 는 job 에 포함되지 않는다 (누출 방지).
 *
 * 사용법:
 *   bun run bin/cfgm-lme-enqueue.ts                 # 전체 500 문항
 *   bun run bin/cfgm-lme-enqueue.ts --limit 50      # 부분 실행
 *   bun run bin/cfgm-lme-enqueue.ts --top-k 10 --json
 *
 * 처리 후 채점: bin/cfgm-lme-score.ts 참조.
 */

const repoRoot = process.env.CFGM_PROJECT_ROOT ?? process.env.CFGM_PROJECT ?? process.cwd();
const args = process.argv.slice(2);
const json = args.includes("--json");

function strFlag(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : undefined;
}
function intFlag(name: string, dflt: number): number {
  const v = strFlag(name);
  if (v === undefined) return dflt;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`invalid ${name}: ${v}`);
    process.exit(1);
  }
  return n;
}

const dataPath = resolve(repoRoot, strFlag("--data") ?? "data/longmemeval/longmemeval_s_cleaned.json");
const jobsDir = resolve(repoRoot, "memory/_pending/lme/jobs");
const answersDirRel = "memory/_pending/lme/answers";
const topK = intFlag("--top-k", 10);
const limit = strFlag("--limit") ? intFlag("--limit", 0) : undefined;

const dataFile = Bun.file(dataPath);
if (!(await dataFile.exists())) {
  console.error(`dataset not found: ${dataPath} — bin/cfgm-lme-retrieval.ts 헤더의 다운로드 안내 참조`);
  process.exit(1);
}

const questions = parseLmeQuestions(await dataFile.json());
const pool = limit ? questions.slice(0, limit) : questions;
const embedder = new HashedNgramEmbedder();

await mkdir(jobsDir, { recursive: true });
await mkdir(resolve(repoRoot, answersDirRel), { recursive: true });

let created = 0;
let skippedExisting = 0;

for (const q of pool) {
  const jobPath = resolve(jobsDir, `${q.question_id}.job.md`);
  if (await Bun.file(jobPath).exists()) {
    skippedExisting++;
    continue;
  }

  const seen = new Set<string>();
  const pages: WikiPage[] = [];
  q.haystack_session_ids.forEach((sid, i) => {
    if (seen.has(sid)) return;
    seen.add(sid);
    pages.push({
      path: `sessions/${sid}.md`,
      frontmatter: { id: sid, type: "concept", status: "active", updated_at: "2026-01-01" },
      body: sessionToText(q.haystack_sessions[i] ?? [], q.haystack_dates?.[i]),
      claimIds: [],
      evidence: [],
    });
  });

  const index = new SearchIndex(":memory:");
  index.rebuild({ wikiPages: pages, claims: [], embedder });
  const retrieved = index
    .searchWikiHybrid(q.question, embedder, { limit: topK })
    .map((h) => h.pageId);
  index.close();

  await Bun.write(jobPath, buildAnswerJob({ question: q, retrievedSessionIds: retrieved, answersDir: answersDirRel }));
  created++;
}

if (json) {
  console.log(JSON.stringify({ jobsDir, topK, total: pool.length, created, skippedExisting }, null, 2));
} else {
  console.log(`✓ LongMemEval answer jobs — created=${created} skipped=${skippedExisting} (top-k ${topK})`);
  console.log(`  jobs: ${jobsDir}`);
  if (created > 0) {
    console.log(`\n→ PAI 세션 처리 필요 (원칙 5 — 메인 세션 처리 금지):`);
    console.log(`  별도 터미널: CLAUDE_CONFIG_DIR=.claude-pai claude → "lme answer job 처리해줘"`);
    console.log(`  처리 후 채점: bun run bin/cfgm-lme-score.ts`);
  }
}
