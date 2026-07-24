#!/usr/bin/env bun
import { Glob } from "bun";
import { resolve, relative, extname } from "node:path";
import { mkdir, stat } from "node:fs/promises";
import { enqueueSource } from "../src/core/capture/CaptureEnqueuer";

/**
 * cfgm-capture — 세션 transcript/노트 파일을 wiki page draft 추출용 큐로 enqueue.
 *
 * 흐름:
 *   1) 입력 파일 1개 또는 디렉토리 (재귀, .md/.txt/.jsonl 만) 스캔
 *   2) 파일별 SHA-256 stale 체크 — 기존 job (모든 status) 에 같은 SHA 있으면 skip
 *   3) memory/_pending/capture/jobs/<slug>.job.md 생성 (host LLM 처리 대상)
 *
 * 사용법:
 *   bun run bin/cfgm-capture.ts --input <파일|디렉토리>
 *   bun run bin/cfgm-capture.ts --input <경로> --force
 *   bun run bin/cfgm-capture.ts --input <경로> --json
 *
 * docs/RULES.md 원칙 2 준수: 본 CLI 는 LLM API 를 호출하지 않는다.
 * 실제 draft 작성은 host LLM (PAI 세션) 이 _spec/prompt.md 를 따라 처리한다.
 */

interface ParsedArgs {
  input: string | null;
  jobsDir: string;
  draftsDir: string;
  specDir: string;
  force: boolean;
  json: boolean;
}

const ALLOWED_EXT = new Set([".md", ".txt", ".jsonl"]);
const REPO_ROOT = process.env.CFGM_PROJECT_ROOT ?? process.env.CFGM_PROJECT ?? process.cwd();

function parseArgs(argv: string[]): ParsedArgs {
  const repoRoot = REPO_ROOT;
  const out: ParsedArgs = {
    input: null,
    jobsDir: resolve(repoRoot, "memory/_pending/capture/jobs"),
    draftsDir: resolve(repoRoot, "memory/_pending/capture/drafts"),
    specDir: resolve(repoRoot, "memory/_pending/capture/_spec"),
    force: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input" && argv[i + 1]) { out.input = resolve(repoRoot, argv[++i]); continue; }
    if (a === "--jobs-dir" && argv[i + 1]) { out.jobsDir = resolve(repoRoot, argv[++i]); continue; }
    if (a === "--drafts-dir" && argv[i + 1]) { out.draftsDir = resolve(repoRoot, argv[++i]); continue; }
    if (a === "--force") { out.force = true; continue; }
    if (a === "--json") { out.json = true; continue; }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

if (!args.input) {
  console.error("사용법: cfgm capture --input <파일|디렉토리> [--force] [--json]");
  process.exit(2);
}

let inputStat;
try {
  inputStat = await stat(args.input);
} catch {
  console.error(`입력 경로를 찾을 수 없습니다: ${args.input}`);
  process.exit(1);
}

await mkdir(args.jobsDir, { recursive: true });
await mkdir(args.draftsDir, { recursive: true });

const filesToProcess: string[] = [];
if (inputStat.isDirectory()) {
  const glob = new Glob("**/*");
  for await (const rel of glob.scan({ cwd: args.input })) {
    const full = resolve(args.input, rel);
    if (!ALLOWED_EXT.has(extname(full).toLowerCase())) continue;
    const st = await stat(full);
    if (!st.isFile()) continue;
    filesToProcess.push(full);
  }
} else {
  filesToProcess.push(args.input);
}

const stats = { scanned: 0, enqueued: 0, skipped: 0 };
const generatedAt = new Date().toISOString();

for (const fullPath of filesToProcess) {
  stats.scanned++;
  const source = await Bun.file(fullPath).text();

  const result = await enqueueSource({
    sourcePath: relative(REPO_ROOT, fullPath),
    sourceText: source,
    jobsDir: args.jobsDir,
    draftsDir: relative(REPO_ROOT, args.draftsDir),
    specDir: relative(REPO_ROOT, args.specDir),
    force: args.force,
    now: new Date(generatedAt),
  });

  if (result.skipped) { stats.skipped++; continue; }
  stats.enqueued++;
}

if (args.json) {
  console.log(JSON.stringify({ input: args.input, jobsDir: args.jobsDir, draftsDir: args.draftsDir, ...stats }, null, 2));
} else {
  console.log(`capture enqueue — input ${args.input}`);
  console.log(`scanned=${stats.scanned} enqueued=${stats.enqueued} skipped=${stats.skipped}`);
  if (stats.enqueued > 0) {
    console.log(`\n→ PAI 세션 처리 필요: ${stats.enqueued} 건`);
    console.log(`  PAI 세션이 떠 있다면 다음 prompt/hook 시 자동 인지하여 처리합니다.`);
    console.log(`  PAI 세션이 없다면 별도 터미널에서 'CLAUDE_CONFIG_DIR=.claude-pai claude' 로 띄우세요.`);
  }
}
