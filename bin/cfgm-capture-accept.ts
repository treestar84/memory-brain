#!/usr/bin/env bun
import { resolve } from "node:path";
import { mkdir, rename, readFile, writeFile, unlink } from "node:fs/promises";
import { resolveStorageRoot } from "../src/hooks/bootstrap";

/**
 * cfgm-capture-accept — capture draft 를 정식 wiki page 로 승격.
 *
 * 사용법:
 *   bun run bin/cfgm-capture-accept.ts <slug> --type concept|decision|project
 *   bun run bin/cfgm-capture-accept.ts <slug> --type concept --force   # 기존 page supersede
 *   bun run bin/cfgm-capture-accept.ts <slug> --type concept --drafts-dir <경로>  # 위치 명시
 *
 * draft 탐색: repo 큐 (memory/_pending/capture/drafts) 우선, 없으면 storage 큐
 * (<storageRoot>/_pending/capture/drafts) 도 탐색한다. 동일 slug 가 양쪽에 모두
 * 존재하면 모호하므로 --drafts-dir 로 명시를 요구한다.
 *
 * drafts/<slug>.md → memory/<type>s/<slug>.md 이동, frontmatter status: draft → active.
 * 대상이 이미 존재하면 --force 없이는 거부 (exit 1).
 */

const TYPE_TO_DIR: Record<string, string> = {
  concept: "concepts",
  decision: "decisions",
  project: "projects",
};

function parseArgs(argv: string[]): {
  slug: string | null;
  type: string | null;
  force: boolean;
  json: boolean;
  draftsDir: string | null;
} {
  let slug: string | null = null;
  let type: string | null = null;
  let force = false;
  let json = false;
  let draftsDir: string | null = null;
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--type" && argv[i + 1]) { type = argv[++i]!; continue; }
    if (a === "--force") { force = true; continue; }
    if (a === "--json") { json = true; continue; }
    if (a === "--drafts-dir" && argv[i + 1]) { draftsDir = argv[++i]!; continue; }
    positional.push(a!);
  }
  slug = positional[0] ?? null;
  return { slug, type, force, json, draftsDir };
}

function isSafeSlug(slug: string): boolean {
  if (!slug) return false;
  if (slug.includes("/") || slug.includes("\\") || slug.includes("..")) return false;
  return /^[a-zA-Z0-9_.-]+$/.test(slug);
}

const repoRoot = process.env.CFGM_PROJECT_ROOT ?? process.env.CFGM_PROJECT ?? process.cwd();
const { slug, type, force, json, draftsDir: draftsDirArg } = parseArgs(process.argv.slice(2));

if (!slug || !type) {
  console.error("사용법: cfgm capture-accept <slug> --type concept|decision|project [--force] [--drafts-dir <경로>]");
  process.exit(2);
}

if (!isSafeSlug(slug)) {
  console.error(`잘못된 slug: ${slug} (경로 구분자/.. 금지)`);
  process.exit(1);
}

const targetDirName = TYPE_TO_DIR[type];
if (!targetDirName) {
  console.error(`알 수 없는 type: ${type} (concept|decision|project 중 하나)`);
  process.exit(2);
}

const repoDraftsDir = resolve(repoRoot, "memory/_pending/capture/drafts");
const storageDraftsDir = resolve(resolveStorageRoot(), "_pending/capture/drafts");

let draftsDir: string;
if (draftsDirArg) {
  draftsDir = resolve(repoRoot, draftsDirArg);
} else {
  const repoCandidate = resolve(repoDraftsDir, `${slug}.md`);
  const storageCandidate = resolve(storageDraftsDir, `${slug}.md`);
  const repoExists = await Bun.file(repoCandidate).exists();
  // storage 큐가 repo 큐와 동일 경로면(예: 테스트 환경) 중복 판정을 피한다.
  const storageIsDistinct = resolve(storageDraftsDir) !== resolve(repoDraftsDir);
  const storageExists = storageIsDistinct && (await Bun.file(storageCandidate).exists());

  if (repoExists && storageExists) {
    console.error(
      `draft "${slug}" 가 repo 큐(${repoDraftsDir})와 storage 큐(${storageDraftsDir}) 양쪽에 존재합니다 — --drafts-dir 로 위치를 명시하세요.`,
    );
    process.exit(1);
  }
  draftsDir = repoExists ? repoDraftsDir : storageDraftsDir;
}

const targetDir = resolve(repoRoot, "memory", targetDirName);
const targetPath = resolve(targetDir, `${slug}.md`);
const archiveDir = resolve(targetDir, "_archive");

const draftPath = resolve(draftsDir, `${slug}.md`);
const draftFile = Bun.file(draftPath);
if (!(await draftFile.exists())) {
  console.error(`draft 를 찾을 수 없습니다: ${draftPath}`);
  process.exit(1);
}

const targetFile = Bun.file(targetPath);
const targetExists = await targetFile.exists();

if (targetExists && !force) {
  console.error(`이미 존재하는 page 입니다: ${targetPath} — --force 로 supersede 하세요.`);
  process.exit(1);
}

await mkdir(targetDir, { recursive: true });

if (targetExists && force) {
  await mkdir(archiveDir, { recursive: true });
  const archivePath = resolve(archiveDir, `${slug}.md`);
  await rename(targetPath, archivePath);
}

let content = await readFile(draftPath, "utf-8");
content = content.replace(/^status:\s*draft\s*$/m, "status: active");

await writeFile(targetPath, content, "utf-8");
try {
  await unlink(draftPath);
} catch {
  // 삭제 실패해도 승격은 이미 완료 — draft 잔존은 사람이 정리
}

if (json) {
  console.log(JSON.stringify({ slug, type, draftsDir, targetPath, supersededExisting: targetExists }, null, 2));
} else {
  console.log(`승격 완료: ${draftPath} → ${targetPath}`);
  if (targetExists) console.log(`기존 page 는 ${resolve(archiveDir, `${slug}.md`)} 로 보관되었습니다.`);
  console.log(`\n→ cfgm rebuild-index --embeddings 재실행 필요 (검색 인덱스 갱신).`);
}
