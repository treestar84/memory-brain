#!/usr/bin/env bun
import { Glob } from "bun";
import { resolve, relative, extname, basename } from "node:path";
import { mkdir, stat } from "node:fs/promises";

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

function slugFromPath(p: string): string {
  const base = basename(p, extname(p));
  return base
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "capture";
}

async function sha256(text: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(text);
  return hasher.digest("hex");
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
  const sha = await sha256(source);
  const slug = slugFromPath(fullPath);
  const jobPath = resolve(args.jobsDir, `${slug}.job.md`);

  // Stale check — 같은 slug 의 기존 job (status 무관) 에 동일 SHA 가 있으면 skip.
  if (!args.force) {
    const existingJob = Bun.file(jobPath);
    if (await existingJob.exists()) {
      const txt = await existingJob.text();
      if (txt.includes(`source_sha256: ${sha}`)) { stats.skipped++; continue; }
    }
  }

  const job = renderJobFile({
    slug,
    sourcePath: relative(REPO_ROOT, fullPath),
    sourceSha: sha,
    draftsDir: relative(REPO_ROOT, args.draftsDir),
    specDir: relative(REPO_ROOT, args.specDir),
    generatedAt,
  });
  await Bun.write(jobPath, job);
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

interface RenderJobOpts {
  slug: string;
  sourcePath: string;
  sourceSha: string;
  draftsDir: string;
  specDir: string;
  generatedAt: string;
}

function renderJobFile(o: RenderJobOpts): string {
  return [
    `---`,
    `job_id: cap-${o.generatedAt.slice(0, 10)}-${o.slug}`,
    `status: pending`,
    `attempts: 0`,
    `max_attempts: 3`,
    `source_path: ${o.sourcePath}`,
    `source_sha256: ${o.sourceSha}`,
    `drafts_dir: ${o.draftsDir}`,
    `enqueued_at: ${o.generatedAt}`,
    `---`,
    ``,
    `# Capture job — \`${o.slug}\``,
    ``,
    `이 작업의 처리 방법은 [\`${o.specDir}/prompt.md\`](${o.specDir}/prompt.md) 를 먼저 읽고 따른다.`,
    ``,
    `## 입력`,
    ``,
    `- 원본: [\`${o.sourcePath}\`](${o.sourcePath}) — SHA-256 \`${o.sourceSha}\``,
    ``,
    `## 완료 후`,
    ``,
    `1. 기억할 가치가 있는 지식 후보마다 \`${o.draftsDir}/<page-slug>.md\` 에 wiki page draft 저장 (WIKI-FORMAT.md 준수, \`status: draft\`).`,
    `2. 본 파일 frontmatter 를 \`status: done\` 으로 갱신.`,
    `3. 실패 시 \`status: failed\` + \`failure_reason: <사유>\` 추가.`,
    ``,
  ].join("\n");
}
