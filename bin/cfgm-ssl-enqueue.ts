#!/usr/bin/env bun
import { Glob } from "bun";
import { resolve, relative } from "node:path";
import { mkdir } from "node:fs/promises";
import { SkillNormalizer } from "../src/core/normalizer/SkillNormalizer";
import { resolveRepoRoot } from "../src/hooks/bootstrap";
import { slugify } from "../src/core/util/slug";
import { toPosixPath } from "../src/core/util/path";

/**
 * cfgm-ssl-enqueue — heuristic 1차 + warnings 있는 skill 을 host LLM 작업 큐로 enqueue
 *
 * 흐름:
 *   1) 입력 디렉토리 (.claude/skills/**) 의 SKILL.md 스캔
 *   2) heuristic SkillNormalizer 1차 실행
 *   3) warnings 가 0 인 skill → 즉시 memory/concepts/_ssl/<slug>.json 에 저장 (큐 거치지 않음)
 *   4) warnings 가 1+ 인 skill → memory/_pending/normalize/jobs/<slug>.job.md 에 enqueue
 *
 * 사용법:
 *   bun run bin/cfgm-ssl-enqueue.ts                       # 자동 감지 enqueue
 *   bun run bin/cfgm-ssl-enqueue.ts --skill <path>        # 특정 skill 한 건만
 *   bun run bin/cfgm-ssl-enqueue.ts --force               # SHA 무시, 모두 재처리
 *   bun run bin/cfgm-ssl-enqueue.ts --json
 *
 * docs/RULES.md 원칙 2 준수: 본 CLI 는 LLM API 를 호출하지 않는다.
 * heuristic 만으로 채울 수 없는 hole 은 host LLM 이 큐에서 꺼내 처리.
 */

interface ParsedArgs {
  inputDir: string;
  outDir: string;        // direct output (heuristic-complete skills)
  jobsDir: string;       // pending queue
  specDir: string;       // spec dir reference
  skill: string | null;  // single-skill mode
  force: boolean;
  json: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const repoRoot = resolveRepoRoot();
  const out: ParsedArgs = {
    inputDir: resolve(repoRoot, ".claude/skills"),
    outDir: resolve(repoRoot, "memory/concepts/_ssl"),
    jobsDir: resolve(repoRoot, "memory/_pending/normalize/jobs"),
    specDir: resolve(repoRoot, "memory/_pending/normalize/_spec"),
    skill: null,
    force: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input" && argv[i + 1]) { out.inputDir = resolve(repoRoot, argv[++i]); continue; }
    if (a === "--output" && argv[i + 1]) { out.outDir = resolve(repoRoot, argv[++i]); continue; }
    if (a === "--jobs-dir" && argv[i + 1]) { out.jobsDir = resolve(repoRoot, argv[++i]); continue; }
    if (a === "--skill" && argv[i + 1]) { out.skill = resolve(repoRoot, argv[++i]); continue; }
    if (a === "--force") { out.force = true; continue; }
    if (a === "--json") { out.json = true; continue; }
  }
  return out;
}

function slugFromSkillPath(p: string): string {
  const segs = toPosixPath(p).split("/").filter(Boolean);
  const last = segs[segs.length - 1] ?? "skill";
  if (last.toUpperCase() === "SKILL.MD" && segs.length >= 2) return segs[segs.length - 2]!;
  return last.replace(/\.md$/i, "");
}

async function sha256(text: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(text);
  return hasher.digest("hex");
}

const args = parseArgs(process.argv.slice(2));
await mkdir(args.outDir, { recursive: true });
await mkdir(args.jobsDir, { recursive: true });

const normalizer = new SkillNormalizer();
const stats = { scanned: 0, completeDirect: 0, enqueued: 0, skippedUnchanged: 0 };
const generatedAt = new Date().toISOString();

const filesToProcess: string[] = [];
if (args.skill) {
  filesToProcess.push(args.skill);
} else {
  const glob = new Glob("**/*.md");
  for await (const rawRel of glob.scan({ cwd: args.inputDir })) {
    const rel = toPosixPath(rawRel);
    const lower = rel.toLowerCase();
    if (!lower.endsWith("skill.md") && !lower.match(/^[^/]+\.md$/)) continue;
    filesToProcess.push(resolve(args.inputDir, rel));
  }
}

for (const fullPath of filesToProcess) {
  stats.scanned++;
  const source = await Bun.file(fullPath).text();
  const sha = await sha256(source);
  const slug = slugify(slugFromSkillPath(fullPath), "skill");
  const outPath = resolve(args.outDir, `${slug}.json`);
  const jobPath = resolve(args.jobsDir, `${slug}.job.md`);
  const heuristicPath = resolve(args.jobsDir, `${slug}.heuristic.json`);

  // Stale check — same SHA in either output or pending job → skip
  if (!args.force) {
    const existingOut = Bun.file(outPath);
    if (await existingOut.exists()) {
      try {
        const prev = (await existingOut.json()) as { sourceSha256?: string };
        if (prev.sourceSha256 === sha) { stats.skippedUnchanged++; continue; }
      } catch { /* corrupt → re-enqueue */ }
    }
    const existingJob = Bun.file(jobPath);
    if (await existingJob.exists()) {
      const txt = await existingJob.text();
      if (txt.includes(`source_sha256: ${sha}`)) { stats.skippedUnchanged++; continue; }
    }
  }

  const doc = normalizer.normalize({
    skillPath: relative(process.cwd(), fullPath),
    source,
    sourceSha256: sha,
    generatedAt,
  });

  if (doc.warnings.length === 0) {
    await Bun.write(outPath, JSON.stringify(doc, null, 2));
    stats.completeDirect++;
    continue;
  }

  // Enqueue as host-processable job — heuristic 은 sidecar JSON, job.md 는
  // instruction 만. fence collision (source 안에 ```json) 을 회피한다.
  await Bun.write(heuristicPath, JSON.stringify(doc, null, 2));
  const job = renderJobFile({
    slug,
    sourcePath: relative(process.cwd(), fullPath),
    sourceSha: sha,
    outputPath: relative(process.cwd(), outPath),
    heuristicPath: relative(process.cwd(), heuristicPath),
    specDir: relative(process.cwd(), args.specDir),
    generatedAt,
    warningsCount: doc.warnings.length,
  });
  await Bun.write(jobPath, job);
  stats.enqueued++;
}

if (args.json) {
  console.log(JSON.stringify({ inputDir: args.inputDir, outDir: args.outDir, jobsDir: args.jobsDir, ...stats }, null, 2));
} else {
  console.log(`SSL enqueue — input ${args.inputDir}`);
  console.log(`scanned=${stats.scanned} complete=${stats.completeDirect} enqueued=${stats.enqueued} skipped=${stats.skippedUnchanged}`);
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
    `attempts: 0`,
    `max_attempts: 3`,
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
