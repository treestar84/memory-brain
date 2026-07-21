#!/usr/bin/env bun
import { resolve, dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { WikiReader } from "../src/core/wiki/WikiReader";
import { buildOkfBundle } from "../src/core/okf/OkfExporter";

/**
 * cfgm-okf-export — L3 wiki → OKF (Open Knowledge Format) v0.1 번들 (V3.28).
 *
 * 사용법:
 *   bun run bin/cfgm-okf-export.ts                    # dist/okf 에 export
 *   bun run bin/cfgm-okf-export.ts --out <dir>
 *   bun run bin/cfgm-okf-export.ts --active-only      # active/draft 만
 *   bun run bin/cfgm-okf-export.ts --json
 *
 * 출력: OKF 번들 (markdown + YAML frontmatter). GitHub 렌더 가능, tarball
 * 배포 가능, OKF consumer (Google Knowledge Catalog 등) 가 그대로 읽을 수 있다.
 * wiki 스키마가 truth-source — 본 번들은 파생물이며 재실행으로 재생성.
 */

const repoRoot = process.env.CFGM_PROJECT_ROOT ?? process.env.CFGM_PROJECT ?? process.cwd();
const args = process.argv.slice(2);
const json = args.includes("--json");
const activeOnly = args.includes("--active-only");

let outDir = resolve(repoRoot, "dist/okf");
const outIdx = args.indexOf("--out");
if (outIdx >= 0 && args[outIdx + 1]) outDir = resolve(repoRoot, args[outIdx + 1]!);

const WIKI_SUBDIRS = ["projects", "concepts", "decisions"];
const wikiReader = new WikiReader(resolve(repoRoot, "memory"));

const pages = [];
for (const dir of WIKI_SUBDIRS) {
  for (const p of await wikiReader.readAllInDir(dir)) {
    // `_`-prefix 디렉토리 (_ssl 등 파생물) 제외 — Indexer 와 동일 규칙
    if (p.path.split("/").some((seg) => seg.startsWith("_"))) continue;
    pages.push(p);
  }
}

const files = buildOkfBundle(pages, { includeAllStatuses: !activeOnly });

for (const f of files) {
  const full = resolve(outDir, f.relPath);
  await mkdir(dirname(full), { recursive: true });
  await Bun.write(full, f.content);
}

const conceptCount = files.filter((f) => !f.relPath.endsWith("index.md")).length;
if (json) {
  console.log(JSON.stringify({ outDir, pageCount: pages.length, conceptCount, fileCount: files.length, files: files.map((f) => f.relPath) }, null, 2));
} else {
  console.log(`✓ OKF bundle exported to ${outDir}`);
  console.log(`  concepts: ${conceptCount} (from ${pages.length} wiki pages)`);
  console.log(`  files:    ${files.length} (concept + index)`);
}
