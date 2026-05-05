#!/usr/bin/env bun
import { Glob } from "bun";
import { resolve, relative } from "node:path";
import { mkdir } from "node:fs/promises";
import { SkillNormalizer } from "../src/core/normalizer/SkillNormalizer";

/**
 * cfgm-ssl-normalize — SKILL.md → SSL JSON 변환기 (PR-V3.12 CLI, V3.14 우호).
 *
 * 사용법:
 *   bun run bin/cfgm-ssl-normalize.ts                   # default input/output
 *   bun run bin/cfgm-ssl-normalize.ts --input .claude/skills
 *   bun run bin/cfgm-ssl-normalize.ts --output memory/concepts/_ssl
 *   bun run bin/cfgm-ssl-normalize.ts --force           # SHA256 무시 강제 재생성
 *   bun run bin/cfgm-ssl-normalize.ts --json
 *
 * 출력: memory/concepts/_ssl/<slug>.json — Indexer 가 자동 스캔.
 * SKILL.md 가 source-of-truth, SSL JSON 은 derived/rebuildable.
 */

interface ParsedArgs {
  input: string;
  output: string;
  force: boolean;
  json: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const repoRoot =
    process.env.CFGM_PROJECT_ROOT ?? process.env.CFGM_PROJECT ?? process.cwd();
  const out: ParsedArgs = {
    input: resolve(repoRoot, ".claude/skills"),
    output: resolve(repoRoot, "memory/concepts/_ssl"),
    force: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input" && argv[i + 1]) { out.input = resolve(repoRoot, argv[++i]); continue; }
    if (a === "--output" && argv[i + 1]) { out.output = resolve(repoRoot, argv[++i]); continue; }
    if (a === "--force") { out.force = true; continue; }
    if (a === "--json") { out.json = true; continue; }
  }
  return out;
}

function slugFromSkillPath(p: string): string {
  // .claude/skills/<slug>/SKILL.md  →  <slug>
  // .claude/skills/<slug>.md        →  <slug>
  const segs = p.split("/").filter(Boolean);
  const last = segs[segs.length - 1] ?? "skill";
  if (last.toUpperCase() === "SKILL.MD" && segs.length >= 2) {
    return segs[segs.length - 2]!;
  }
  return last.replace(/\.md$/i, "");
}

async function sha256(text: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(text);
  return hasher.digest("hex");
}

const args = parseArgs(process.argv.slice(2));
await mkdir(args.output, { recursive: true });

const normalizer = new SkillNormalizer();
const glob = new Glob("**/*.md");
const stats = { scanned: 0, generated: 0, skipped: 0, warnings: 0 };
const generatedAt = new Date().toISOString();

for await (const rel of glob.scan({ cwd: args.input })) {
  // Skip non-skill artefacts (workflow.md, README.md, etc.)
  const lower = rel.toLowerCase();
  if (!lower.endsWith("skill.md") && !lower.match(/^[^/]+\.md$/)) continue;
  stats.scanned++;

  const fullPath = resolve(args.input, rel);
  const source = await Bun.file(fullPath).text();
  const sha = await sha256(source);
  const slug = slugFromSkillPath(rel).replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase();
  const outPath = resolve(args.output, `${slug}.json`);

  if (!args.force && (await Bun.file(outPath).exists())) {
    try {
      const prev = await Bun.file(outPath).json() as { sourceSha256?: string };
      if (prev.sourceSha256 === sha) { stats.skipped++; continue; }
    } catch { /* corrupt → regenerate */ }
  }

  const doc = normalizer.normalize({
    skillPath: relative(process.cwd(), fullPath),
    source,
    sourceSha256: sha,
    generatedAt,
  });
  stats.warnings += doc.warnings.length;
  await Bun.write(outPath, JSON.stringify(doc, null, 2));
  stats.generated++;
}

if (args.json) {
  console.log(JSON.stringify({ inputDir: args.input, outputDir: args.output, ...stats }, null, 2));
} else {
  console.log(`SSL normalize — input ${args.input}`);
  console.log(`             → output ${args.output}`);
  console.log(`scanned=${stats.scanned} generated=${stats.generated} skipped=${stats.skipped} warnings=${stats.warnings}`);
}
