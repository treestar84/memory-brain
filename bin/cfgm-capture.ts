#!/usr/bin/env bun
import { Glob } from "bun";
import { fileURLToPath } from "node:url";
import { resolve, relative, extname, dirname } from "node:path";
import { mkdir, stat, copyFile } from "node:fs/promises";
import { enqueueSource } from "../src/core/capture/CaptureEnqueuer";
import { resolveRepoRoot } from "../src/hooks/bootstrap";

const TOOL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * 신규 프로젝트에는 job 이 참조하는 `_spec/prompt.md`/`WIKI-FORMAT.md` 가 없다
 * (V3.43 실효성 검증 시뮬레이션에서 세 프로젝트 모두 재현됨) — job 파일 지시를 따를
 * 수 없는 상태로 남는다. 이미 있으면 건드리지 않고, 없을 때만 툴 저장소의 canonical
 * 사본을 복사해 채운다.
 */
async function scaffoldCaptureDocs(memoryDir: string): Promise<void> {
  const targets = [
    { from: resolve(TOOL_ROOT, "memory/_pending/capture/_spec/prompt.md"), to: resolve(memoryDir, "_pending/capture/_spec/prompt.md") },
    { from: resolve(TOOL_ROOT, "memory/WIKI-FORMAT.md"), to: resolve(memoryDir, "WIKI-FORMAT.md") },
  ];
  for (const { from, to } of targets) {
    if (await Bun.file(to).exists()) continue;
    if (!(await Bun.file(from).exists())) continue;
    await mkdir(dirname(to), { recursive: true });
    await copyFile(from, to);
  }
}

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
const REPO_ROOT = resolveRepoRoot();

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
await scaffoldCaptureDocs(resolve(REPO_ROOT, "memory"));

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
