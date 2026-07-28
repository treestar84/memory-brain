#!/usr/bin/env bun
import { resolve, join, basename } from "node:path";
import { mkdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { parse, stringify } from "yaml";
import { WikiReader } from "../src/core/wiki/WikiReader";
import { UsageLog } from "../src/core/stats/UsageLog";
import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { resolveStorageRoot, resolveRepoRoot } from "../src/hooks/bootstrap";
import { evaluateWikiDecay, type WikiDecayFinding, type WikiDecayPageInput } from "../src/core/governance/WikiDecayEngine";
import type { WikiType } from "../src/core/wiki/types";

/**
 * cfgm-decay — L3 wiki 망각 판정 (V3.35).
 *
 * 사용법:
 *   cfgm decay                 dry-run: tier별 판정 출력 + memory/reports/decay-latest.md 저장
 *   cfgm decay --json          JSON 출력
 *   cfgm decay --archive <id>  해당 페이지를 _archive/ 로 이동 (삭제 아님)
 *
 * 삭제는 절대 하지 않는다 — supersede/archive 만 제안·수행한다.
 */

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
const WIKI_DIRS: Array<{ dir: string; type: WikiType }> = [
  { dir: "projects", type: "project" },
  { dir: "concepts", type: "concept" },
  { dir: "decisions", type: "decision" },
];

const args = process.argv.slice(2);
const json = args.includes("--json");
const archiveIdx = args.indexOf("--archive");
const archivePageId = archiveIdx >= 0 ? args[archiveIdx + 1] : null;

const repoRoot = resolveRepoRoot();
const memoryDir = resolve(repoRoot, "memory");
const storageRoot = resolveStorageRoot();

const wikiReader = new WikiReader(memoryDir);
const usageLog = new UsageLog(new FsStorage(storageRoot));
const clock = new RealClock();

const pages: WikiDecayPageInput[] = [];
for (const { dir, type } of WIKI_DIRS) {
  for (const p of await wikiReader.readAllInDir(dir)) {
    pages.push({
      id: p.frontmatter.id,
      type,
      status: p.frontmatter.status,
      updatedAt: p.frontmatter.updated_at,
      path: p.path,
    });
  }
}

if (archivePageId) {
  process.exit(await runArchive(archivePageId));
}

const pageStats = await usageLog.pageStats();
const nowIso = clock.isoNow();
const findings = evaluateWikiDecay(pages, pageStats, nowIso);

if (json) {
  console.log(JSON.stringify({ generatedAt: nowIso, findings }, null, 2));
  process.exit(0);
}

printReport(findings, nowIso);
const reportPath = await writeReport(findings, nowIso);
console.log(`\n리포트 저장: ${reportPath}`);
process.exit(0);

// ---- helpers ----

function groupByTier(findings: readonly WikiDecayFinding[]) {
  const groups: Record<string, WikiDecayFinding[]> = {
    "stale-draft": [],
    "decay-candidate": [],
    aging: [],
    unknown: [],
    fresh: [],
  };
  for (const f of findings) groups[f.tier]!.push(f);
  return groups;
}

function printReport(findings: readonly WikiDecayFinding[], generatedAt: string): void {
  const groups = groupByTier(findings);
  console.log(`cfgm decay — wiki 망각 판정 (${generatedAt})\n`);
  console.log(`전체 page: ${findings.length}건 — fresh: ${groups.fresh!.length}건 (상세 생략)\n`);

  for (const tier of ["stale-draft", "decay-candidate", "aging", "unknown"] as const) {
    const list = groups[tier]!;
    console.log(`## ${tier} (${list.length}건)`);
    if (list.length === 0) {
      console.log("  (없음)");
    } else {
      for (const f of list) {
        console.log(`  - ${f.pageId}  (${f.path}, age=${f.ageDays}일, recalls=${f.recalls})`);
        for (const r of f.reasons) console.log(`      · ${r}`);
      }
    }
    console.log("");
  }

  console.log(`조치: cfgm decay --archive <pageId>  (삭제 아님 — _archive/ 로 이동 + status: archived)`);
}

function toMarkdown(findings: readonly WikiDecayFinding[], generatedAt: string): string {
  const groups = groupByTier(findings);
  const lines: string[] = [
    `# Wiki Decay Report`,
    ``,
    `> 생성: ${generatedAt} · 전체 page: ${findings.length}건 · fresh: ${groups.fresh!.length}건`,
    ``,
    `삭제는 하지 않는다 — 조치는 \`cfgm decay --archive <pageId>\` 로 명시 승인 후에만 수행.`,
    ``,
  ];

  for (const tier of ["stale-draft", "decay-candidate", "aging", "unknown"] as const) {
    const list = groups[tier]!;
    lines.push(`## ${tier} (${list.length}건)`, ``);
    if (list.length === 0) {
      lines.push(`(없음)`, ``);
      continue;
    }
    for (const f of list) {
      lines.push(`### ${f.pageId}`, ``);
      lines.push(`- path: \`${f.path}\``);
      lines.push(`- age: ${f.ageDays}일, recalls: ${f.recalls}, lastRecallAt: ${f.lastRecallAt ?? "없음"}`);
      lines.push(`- reasons:`);
      for (const r of f.reasons) lines.push(`  - ${r}`);
      lines.push(``);
    }
  }

  return lines.join("\n");
}

async function writeReport(findings: readonly WikiDecayFinding[], generatedAt: string): Promise<string> {
  const reportsDir = join(memoryDir, "reports");
  await mkdir(reportsDir, { recursive: true });
  const path = join(reportsDir, "decay-latest.md");
  await Bun.write(path, toMarkdown(findings, generatedAt));
  return path;
}

async function runArchive(pageId: string): Promise<number> {
  const target = pages.find((p) => p.id === pageId);
  if (!target) {
    console.error(`알 수 없는 pageId: ${pageId}`);
    console.error(`cfgm decay 로 전체 목록을 먼저 확인하세요.`);
    return 1;
  }

  const srcPath = resolve(memoryDir, target.path);
  // path traversal 방어 — 해석된 경로가 memoryDir 밖으로 나가면 거부.
  if (!srcPath.startsWith(memoryDir + "/") && srcPath !== memoryDir) {
    console.error(`경로 오류 — memory/ 밖을 가리킴: ${target.path}`);
    return 1;
  }
  if (!existsSync(srcPath)) {
    console.error(`파일이 존재하지 않음: ${srcPath}`);
    return 1;
  }

  const typeDir = `${target.type}s`; // project→projects, concept→concepts, decision→decisions
  const destDir = join(memoryDir, typeDir, "_archive");
  const destPath = join(destDir, basename(srcPath));

  const raw = await Bun.file(srcPath).text();
  const match = FRONTMATTER_RE.exec(raw);
  if (!match) {
    console.error(`frontmatter 파싱 실패 — 이동 취소: ${srcPath}`);
    return 1;
  }

  const frontmatter = parse(match[1]!) as Record<string, unknown>;
  const body = match[2]!;
  const nowIso = new RealClock().isoNow();
  const updated = { ...frontmatter, status: "archived", archived_at: nowIso };
  const newContent = `---\n${stringify(updated).trimEnd()}\n---\n${body}`;

  await mkdir(destDir, { recursive: true });
  await Bun.write(destPath, newContent);
  await unlink(srcPath);

  console.log(`✓ archived: ${target.path} → ${join(typeDir, "_archive", basename(srcPath))}`);
  console.log(`  status: archived, archived_at: ${nowIso}`);
  console.log(`\n인덱스 갱신 필요: cfgm rebuild-index 재실행 필요`);
  return 0;
}
