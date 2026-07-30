#!/usr/bin/env bun
/**
 * cfgm-learn — 워크플로우 학습: 사용자 기술 → SKILL.md + SSL enqueue
 *
 * "학습해라" 명령 진입점. 사용자가 세션 내에서 진행한 워크플로우를 기술하면
 * memory/workflows/<slug>.md (SKILL.md 포맷) 를 생성하고 SSL normalize 큐에 enqueue.
 *
 * 사용법:
 *   bun run bin/cfgm-learn.ts --name <slug> --goal "한 줄 목표"
 *   bun run bin/cfgm-learn.ts --name <slug> --goal "..." --steps-file workflow.md
 *   echo "steps..." | bun run bin/cfgm-learn.ts --name <slug> --goal "..."
 *   bun run bin/cfgm-learn.ts --name <slug> --goal "..." --json
 *
 * docs/RULES.md 원칙 2 준수: LLM API 직접 호출 없음.
 */

import { resolve, relative } from "node:path";
import { mkdir } from "node:fs/promises";
import { SkillNormalizer } from "../src/core/normalizer/SkillNormalizer";
import { resolveRepoRoot, resolveStorageRoot } from "../src/hooks/bootstrap";
import { Redactor } from "../src/core/security/Redactor";
import { FsStorage } from "../src/core/storage/FsStorage";
import { writeFileAtomic } from "../src/core/util/atomicWrite";
import { RealClock } from "../src/core/clock/Clock";

interface ParsedArgs {
  name: string | null;
  goal: string | null;
  trigger: string | null;
  stepsFile: string | null;
  force: boolean;
  workflowsDir: string;
  outDir: string;
  jobsDir: string;
  specDir: string;
  json: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const repoRoot = resolveRepoRoot();
  const out: ParsedArgs = {
    name: null,
    goal: null,
    trigger: null,
    stepsFile: null,
    force: false,
    workflowsDir: resolve(repoRoot, "memory/workflows"),
    outDir: resolve(repoRoot, "memory/concepts/_ssl"),
    jobsDir: resolve(repoRoot, "memory/_pending/normalize/jobs"),
    specDir: resolve(repoRoot, "memory/_pending/normalize/_spec"),
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--name" && argv[i + 1]) { out.name = argv[++i]!; continue; }
    if (a === "--goal" && argv[i + 1]) { out.goal = argv[++i]!; continue; }
    if (a === "--trigger" && argv[i + 1]) { out.trigger = argv[++i]!; continue; }
    if (a === "--steps-file" && argv[i + 1]) { out.stepsFile = resolve(repoRoot, argv[++i]!); continue; }
    if (a === "--force") { out.force = true; continue; }
    if (a === "--json") { out.json = true; continue; }
  }
  return out;
}

function normalizeSlug(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase();
}

async function readStdin(): Promise<string | null> {
  if (process.stdin.isTTY) return null;
  const text = await Bun.stdin.text();
  return text.trim() || null;
}

async function readStepsFile(filePath: string): Promise<string> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    process.stderr.write(`error: steps-file not found: ${filePath}\n`);
    process.exit(1);
  }
  return await file.text();
}

function renderSkillMd(slug: string, goal: string, trigger: string | null, steps: string | null): string {
  const triggerLine = trigger ?? `학습된 워크플로우 ${slug} 수행`;
  const acquireSection = steps
    ? steps.trim()
    : "<!-- TODO: steps 를 여기에 채워라 -->";

  return [
    `---`,
    `name: ${slug}`,
    `description: ${goal}. Use when user wants to replay this workflow.`,
    `trigger: ${triggerLine}`,
    `---`,
    ``,
    `## Prepare`,
    ``,
    `이 워크플로우를 재실행하기 위한 컨텍스트를 확인한다.`,
    ``,
    `## Acquire`,
    ``,
    acquireSection,
    ``,
    `## Verify`,
    ``,
    `이 워크플로우가 성공적으로 완료되었는지 확인한다.`,
    ``,
  ].join("\n");
}

async function sha256(text: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(text);
  return hasher.digest("hex");
}

interface RenderJobOpts {
  slug: string;
  sourcePath: string;
  sourceSha: string;
  outputPath: string;
  heuristicPath: string;
  specDir: string;
  generatedAt: string;
  warningsCount: number;
}

function renderJobFile(o: RenderJobOpts): string {
  return [
    `---`,
    `job_id: norm-${o.generatedAt.slice(0, 10)}-${o.slug}`,
    `status: pending`,
    `source_path: ${o.sourcePath}`,
    `source_sha256: ${o.sourceSha}`,
    `heuristic_path: ${o.heuristicPath}`,
    `output_path: ${o.outputPath}`,
    `enqueued_at: ${o.generatedAt}`,
    `warnings_count: ${o.warningsCount}`,
    `---`,
    ``,
    `# Normalize job — \`${o.slug}\``,
    ``,
    `이 작업의 처리 방법은 [\`${o.specDir}/prompt.md\`](${o.specDir}/prompt.md) + [\`${o.specDir}/ssl-schema.md\`](${o.specDir}/ssl-schema.md) 를 먼저 읽고 따른다.`,
    ``,
    `## 입력`,
    ``,
    `- 원본: [\`${o.sourcePath}\`](${o.sourcePath}) — SHA-256 \`${o.sourceSha}\``,
    `- Heuristic 1차 (warnings ${o.warningsCount}): [\`${o.heuristicPath}\`](${o.heuristicPath})`,
    ``,
    `## 완료 후`,
    ``,
    `1. \`${o.outputPath}\` 에 enriched SSL JSON 저장.`,
    `2. \`bun run bin/cfgm-ssl-validate.ts ${o.outputPath}\` 호출.`,
    `3. exit 0 → 본 파일 frontmatter \`status: done\` 으로 갱신.`,
    `4. exit ≠ 0 → \`status: failed\` + \`failure_reason: <stderr 일부>\` 추가.`,
    ``,
  ].join("\n");
}

// --- main ---

const args = parseArgs(process.argv.slice(2));

if (!args.name) {
  process.stderr.write("error: --name <slug> is required\n");
  process.stderr.write("usage: bun run bin/cfgm-learn.ts --name <slug> --goal \"<goal>\"\n");
  process.exit(1);
}

if (!args.goal) {
  process.stderr.write("error: --goal \"<goal>\" is required\n");
  process.stderr.write("usage: bun run bin/cfgm-learn.ts --name <slug> --goal \"<goal>\"\n");
  process.exit(1);
}

const slug = normalizeSlug(args.name);
const skillPath = resolve(args.workflowsDir, `${slug}.md`);

// Check for existing workflow file
if (!args.force && (await Bun.file(skillPath).exists())) {
  process.stderr.write(`error: workflow already exists: ${skillPath}\n`);
  process.stderr.write("use --force to overwrite\n");
  process.exit(1);
}

// Read steps
let steps: string | null = null;
if (args.stepsFile) {
  steps = await readStepsFile(args.stepsFile);
} else {
  steps = await readStdin();
}

const warnings: string[] = [];
if (!steps) {
  warnings.push("steps not provided");
}

// Generate SKILL.md
// 사용자가 --goal/--trigger/steps 로 직접 기술한 텍스트가 git 추적 memory/workflows/
// 로 그대로 저장되므로, capture-accept 와 동일하게 쓰기 직전에 시크릿을 마스킹한다
// (V3.43 — 배선 매트릭스 전수 감사에서 발견된 두 번째 누락 지점).
const redactor = new Redactor(new FsStorage(resolveStorageRoot()), new RealClock());
const rendered = renderSkillMd(slug, args.goal, args.trigger, steps);
const { text: skillMd, redacted } = await redactor.redact(rendered);

await mkdir(args.workflowsDir, { recursive: true });
await writeFileAtomic(skillPath, skillMd);

// SSL normalize
await mkdir(args.outDir, { recursive: true });
await mkdir(args.jobsDir, { recursive: true });

const generatedAt = new Date().toISOString();
const sha = await sha256(skillMd);
const outPath = resolve(args.outDir, `${slug}.json`);
const jobPath = resolve(args.jobsDir, `${slug}.job.md`);
const heuristicPath = resolve(args.jobsDir, `${slug}.heuristic.json`);

const normalizer = new SkillNormalizer();
const doc = normalizer.normalize({
  skillPath: relative(process.cwd(), skillPath),
  source: skillMd,
  sourceSha256: sha,
  generatedAt,
});

// Merge warnings from steps check + normalizer
const allWarnings = [...warnings, ...doc.warnings];

let sslResult: "direct" | "enqueued";

if (allWarnings.length === 0) {
  await Bun.write(outPath, JSON.stringify(doc, null, 2));
  sslResult = "direct";
} else {
  await Bun.write(heuristicPath, JSON.stringify(doc, null, 2));
  const job = renderJobFile({
    slug,
    sourcePath: relative(process.cwd(), skillPath),
    sourceSha: sha,
    outputPath: relative(process.cwd(), outPath),
    heuristicPath: relative(process.cwd(), heuristicPath),
    specDir: relative(process.cwd(), args.specDir),
    generatedAt,
    warningsCount: allWarnings.length,
  });
  await Bun.write(jobPath, job);
  sslResult = "enqueued";
}

const relSkillPath = relative(process.cwd(), skillPath);

if (args.json) {
  console.log(JSON.stringify({
    name: slug,
    skillPath: relSkillPath,
    sslResult,
    warnings: allWarnings.length,
    redacted,
  }, null, 2));
} else {
  console.log(`cfgm-learn — 워크플로우 학습`);
  console.log(`  name:      ${slug}`);
  console.log(`  skillPath: ${relSkillPath}`);
  console.log(`  ssl:       ${sslResult}`);
  if (allWarnings.length > 0) {
    console.log(`  warnings:  ${allWarnings.join(", ")}`);
  }
  if (redacted) {
    console.log(`  ⚠ 시크릿 패턴 감지 — 마스킹 후 저장됨 (security/redacted.jsonl 참조)`);
  }
}
