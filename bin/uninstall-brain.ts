import { readFile, writeFile, unlink, rm, readlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync, lstatSync } from "node:fs";
import { BEGIN_MARKER, END_MARKER } from "./install-brain";

const MARKER = "cfgm-os-brain";
const HOME = process.env.HOME!;
const BRAIN_HOME = process.env.CFGM_BRAIN_HOME || join(HOME, ".claude-brain");
const SETTINGS_PATH = join(BRAIN_HOME, "settings.json");
const SKILL_LINK = join(BRAIN_HOME, "skills", "CFGM-OS");
const BIN_DIR = join(BRAIN_HOME, "bin");
const LAUNCHER = join(BIN_DIR, "claude-pai");
const LOCAL_BIN_LINK = join(HOME, ".local", "bin", "claude-pai");
const CLAUDE_MD_PATH = join(BRAIN_HOME, "CLAUDE.md");
const MANIFEST_PATH = join(BRAIN_HOME, "install-manifest.json");
const PROGRESS_PATH = join(BRAIN_HOME, "install-progress.json");

async function cleanSettings() {
  if (!existsSync(SETTINGS_PATH)) return;
  const settings = JSON.parse(await readFile(SETTINGS_PATH, "utf-8"));
  if (settings.hooks) {
    for (const type of Object.keys(settings.hooks)) {
      settings.hooks[type] = settings.hooks[type].filter(
        (h: any) => h.matcher !== MARKER
      );
      if (settings.hooks[type].length === 0) delete settings.hooks[type];
    }
    if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  }
  if (Object.keys(settings).length === 0) {
    await unlink(SETTINGS_PATH);
  } else {
    await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  }
}

async function unlinkIfExists(p: string) {
  try { lstatSync(p); } catch { return; }
  try { await unlink(p); } catch {}
}

async function cleanLocalBinLink() {
  try {
    const st = lstatSync(LOCAL_BIN_LINK);
    if (!st.isSymbolicLink()) {
      console.log(`[cfgm-brain] ${LOCAL_BIN_LINK}은 심링크 아님 — 건드리지 않음.`);
      return;
    }
    const target = await readlink(LOCAL_BIN_LINK);
    if (target === LAUNCHER) {
      await unlink(LOCAL_BIN_LINK);
    } else {
      console.log(`[cfgm-brain] ${LOCAL_BIN_LINK}이 다른 대상(${target}) 가리킴 — 건드리지 않음.`);
    }
  } catch {
    // not present — nothing to do
  }
}

async function rmdirIfEmpty(p: string) {
  if (!existsSync(p)) return;
  try { await rmdir(p); } catch {} // fails silently if non-empty
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

async function cleanClaudeMdManagedBlock() {
  if (!existsSync(CLAUDE_MD_PATH)) return;
  const existing = await readFile(CLAUDE_MD_PATH, "utf-8");
  const beginCount = countOccurrences(existing, BEGIN_MARKER);
  const endCount = countOccurrences(existing, END_MARKER);
  if (beginCount === 0 && endCount === 0) return;
  if (beginCount !== 1 || endCount !== 1) {
    console.error(`[cfgm-brain] CLAUDE.md managed marker 불균형 (begin=${beginCount}, end=${endCount}) — 건드리지 않음.`);
    return;
  }
  const beginIdx = existing.indexOf(BEGIN_MARKER);
  const endIdx = existing.indexOf(END_MARKER, beginIdx + BEGIN_MARKER.length);
  if (beginIdx < 0 || endIdx < 0) return;

  // 블록 제거 + 앞뒤 공백 정리
  let head = existing.slice(0, beginIdx).replace(/\s+$/, "");
  let tail = existing.slice(endIdx + END_MARKER.length).replace(/^\s+/, "");
  let result = head;
  if (tail.length > 0) result = head.length > 0 ? `${head}\n\n${tail}` : tail;
  if (result.length > 0 && !result.endsWith("\n")) result += "\n";

  if (result.trim().length === 0) {
    await unlink(CLAUDE_MD_PATH);
    console.log(`[cfgm-brain] CLAUDE.md 제거됨 (자유 섹션 없음).`);
  } else {
    await writeFile(CLAUDE_MD_PATH, result);
    console.log(`[cfgm-brain] CLAUDE.md managed block 제거됨. 자유 섹션 보존.`);
  }
}

async function main() {
  const purge = process.argv.includes("--purge");

  if (purge) {
    if (existsSync(BRAIN_HOME)) {
      await cleanLocalBinLink();
      await rm(BRAIN_HOME, { recursive: true, force: true });
      console.log(`[cfgm-brain] purged ${BRAIN_HOME}`);
    } else {
      await cleanLocalBinLink();
      console.log(`[cfgm-brain] nothing to purge.`);
    }
    return;
  }

  await cleanSettings();
  await cleanClaudeMdManagedBlock();
  await unlinkIfExists(MANIFEST_PATH);
  await unlinkIfExists(PROGRESS_PATH);
  await unlinkIfExists(SKILL_LINK);
  await unlinkIfExists(LAUNCHER);
  await cleanLocalBinLink();
  await rmdirIfEmpty(join(BRAIN_HOME, "skills"));
  await rmdirIfEmpty(BIN_DIR);

  console.log(`[cfgm-brain] uninstalled. memory-brain/ 데이터는 보존됨 (${join(BRAIN_HOME, "memory-brain")}).`);
  console.log(`완전 제거하려면: bun run bin/uninstall-brain.ts --purge`);
}

main().catch((e) => { console.error("[cfgm-brain] uninstall failed:", e.message); process.exit(1); });
