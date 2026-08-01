#!/usr/bin/env bun
/**
 * cfgm install-project — 프로젝트 단위 설치.
 *
 * `install-brain.ts` (전역 ~/.claude-brain 프로필 + 별도 launcher `claude-pai`) 와 달리,
 * 지정한 프로젝트의 `.claude/settings.json` — Claude Code 가 그 디렉토리에서 세션을 열 때
 * 네이티브로 읽는 프로젝트 설정 파일 — 에 직접 훅을 등록한다. 그 프로젝트에서 평범하게
 * `claude` 를 실행하면 바로 적용되며, CLAUDE_CONFIG_DIR override 나 별도 launcher가 필요 없다.
 *
 * 메모리 데이터(.memory-brain/)는 이미 `resolveStorageRoot()` (bootstrap.ts) 가 cwd/
 * CFGM_PROJECT_ROOT 기준으로 프로젝트별 격리를 기본 제공하므로, 여기서는 훅 command 에
 * `CFGM_PROJECT_ROOT`를 명시적으로 고정해 hook 실행 cwd 에 의존하지 않게 한다.
 *
 * 대상 프로젝트의 기존 `.claude/settings.json`은 이 저장소 자신의 `~/.claude-brain/settings.json`
 * 과 달리 **사용자의 실제 파일**이므로, install-brain.ts 보다 한 단계 더 보수적으로 다룬다:
 *   - marker(cfgm-os-project) 로만 식별되는 훅 엔트리만 upsert. 다른 hooks/설정 키는 절대 건드리지 않음.
 *   - 처음으로 파일을 수정하기 전, 원본을 `.bak-<timestamp>` 로 복사해둔다.
 *   - commands/*.md 도 관리 마커가 있는 파일만 덮어쓰고, 동명의 사용자 파일은 건드리지 않음.
 *   - 프로젝트의 CLAUDE.md / identity 는 전혀 건드리지 않는다 (그건 사용자 개인의 전역 개념).
 *
 * 사용법:
 *   bun run bin/install-project.ts [--project <path>] [--dry-run] [--json]
 *
 * 제거: bun run bin/uninstall-project.ts [--project <path>] [--purge]
 */
import { readFile, writeFile, mkdir, readdir, copyFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isManagedCommand, skillToCommand } from "./install-brain";

export const MARKER = "cfgm-os-project";

type HookCommand = { type: "command"; command: string };
type HookEntry = { matcher: string; hooks: HookCommand[] };
type HookType =
  | "SessionStart" | "UserPromptSubmit" | "PreToolUse" | "PostToolUse" | "Stop" | "PreCompact";

const HOOK_FILES: Record<HookType, string> = {
  SessionStart: "session-start",
  UserPromptSubmit: "user-prompt-submit",
  PreToolUse: "pre-tool-use",
  PostToolUse: "post-tool-use",
  Stop: "session-end",
  PreCompact: "pre-compact",
};

export interface ProjectPaths {
  toolRoot: string;
  targetProject: string;
  claudeDir: string;
  settingsPath: string;
  commandsDir: string;
  manifestPath: string;
  memoryDir: string;
  hooksDir: string;
  skillsSrc: string;
}

export function resolveToolRoot(scriptUrl: string): string {
  return resolve(dirname(fileURLToPath(scriptUrl)), "..");
}

export function resolveProjectPaths(toolRoot: string, targetProject: string): ProjectPaths {
  const claudeDir = join(targetProject, ".claude");
  return {
    toolRoot,
    targetProject,
    claudeDir,
    settingsPath: join(claudeDir, "settings.json"),
    commandsDir: join(claudeDir, "commands"),
    manifestPath: join(claudeDir, "cfgm-project-manifest.json"),
    memoryDir: join(targetProject, ".memory-brain"),
    hooksDir: resolve(toolRoot, "src/hooks"),
    skillsSrc: resolve(toolRoot, "skills"),
  };
}

/**
 * hook 의 `command` 는 셸이 그대로 실행하므로, 경로에 공백이 있으면(프로젝트 디렉토리
 * 이름은 사용자가 자유롭게 정하므로 흔함) 인용 없이 삽입 시 단어 분리로 조용히 깨진다.
 * POSIX 셸 single-quote 규칙(내부 `'` 은 `'\''` 로 이스케이프)으로 안전하게 감싼다.
 */
function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export function buildHookEntries(paths: ProjectPaths): Record<HookType, HookEntry> {
  // V3.44 (Windows 지원): `/usr/bin/env VAR=val cmd` 는 POSIX 셸 전용 문법이라
  // Windows 에서 훅이 전부 실패했다. `--project-root` 를 argv 로 넘기면 순수
  // 프로그램+인자 호출이라 셸 종류를 덜 탄다 — bootstrap.ts 의 resolveStorageRoot 등이
  // 이 값을 최우선으로 읽는다(하위호환: 기존 env-접두사 설치는 재설치 전까지 그대로 동작).
  const entry = (type: HookType): HookEntry => ({
    matcher: MARKER,
    hooks: [{
      type: "command",
      command: `bun run ${shQuote(join(paths.hooksDir, `${HOOK_FILES[type]}.ts`))} --project-root ${shQuote(paths.targetProject)}`,
    }],
  });
  return {
    SessionStart: entry("SessionStart"),
    UserPromptSubmit: entry("UserPromptSubmit"),
    PreToolUse: entry("PreToolUse"),
    PostToolUse: entry("PostToolUse"),
    Stop: entry("Stop"),
    PreCompact: entry("PreCompact"),
  };
}

/** settings.hooks[type] 가 배열이 아니면(수동 편집 실수 등) 병합하지 않고 알린다. */
export function findMalformedHookType(settings: Record<string, any>): string | null {
  const hooks = settings?.hooks;
  if (!hooks || typeof hooks !== "object") return null;
  for (const [type, value] of Object.entries(hooks)) {
    if (!Array.isArray(value)) return type;
  }
  return null;
}

export function mergeHooksIntoSettings(
  settings: Record<string, any>,
  entries: Record<HookType, HookEntry>,
): Record<string, any> {
  const next: Record<string, any> = { ...settings };
  next.hooks = next.hooks ? { ...next.hooks } : {};
  for (const [type, entry] of Object.entries(entries)) {
    const arr: HookEntry[] = Array.isArray(next.hooks[type]) ? [...next.hooks[type]] : [];
    const idx = arr.findIndex((h) => h.matcher === MARKER);
    if (idx >= 0) arr[idx] = entry;
    else arr.push(entry);
    next.hooks[type] = arr;
  }
  return next;
}

export type LoadedSettings =
  | { ok: true; data: Record<string, any> }
  | { ok: false };

/**
 * 파일이 없거나 비어있으면 빈 객체(병합 대상 없음) — 정상.
 * 파일은 있는데 JSON 파싱이 실패하면 절대 조용히 덮어쓰지 않는다 — 호출자가 중단해야 한다
 * (uninstall-project.ts 의 cleanSettings 와 동일한 보수적 원칙: 못 읽으면 안 건드린다).
 */
async function loadJson(path: string): Promise<LoadedSettings> {
  if (!existsSync(path)) return { ok: true, data: {} };
  try {
    const text = await readFile(path, "utf-8");
    if (!text.trim()) return { ok: true, data: {} };
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

async function backupIfNeeded(path: string, alreadyManaged: boolean): Promise<string | null> {
  if (alreadyManaged) return null;
  if (!existsSync(path)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${path}.bak-${stamp}`;
  await copyFile(path, backupPath);
  return backupPath;
}

async function readCfgmVersion(toolRoot: string): Promise<string> {
  try {
    const pkg = JSON.parse(await readFile(resolve(toolRoot, "package.json"), "utf-8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

async function scaffoldCommands(
  paths: ProjectPaths,
  version: string,
  dryRun: boolean,
): Promise<{ written: string[]; skipped: string[] }> {
  const written: string[] = [];
  const skipped: string[] = [];
  if (!existsSync(paths.skillsSrc)) return { written, skipped };
  const entries = await readdir(paths.skillsSrc, { withFileTypes: true });
  for (const d of entries) {
    if (!d.isDirectory()) continue;
    const srcSkill = join(paths.skillsSrc, d.name, "SKILL.md");
    if (!existsSync(srcSkill)) continue;
    const target = join(paths.commandsDir, `${d.name}.md`);
    if (existsSync(target)) {
      const existing = await readFile(target, "utf-8");
      if (!isManagedCommand(existing)) {
        skipped.push(target);
        continue;
      }
    }
    if (!dryRun) {
      await mkdir(paths.commandsDir, { recursive: true });
      const skillMd = await readFile(srcSkill, "utf-8");
      await writeFile(target, skillToCommand(skillMd, version));
    }
    written.push(target);
  }
  return { written, skipped };
}

export const GITATTRIBUTES_MARKER = "cfgm-os:merge=union for jsonl ledgers";
export const GITATTRIBUTES_BLOCK = `# ${GITATTRIBUTES_MARKER} — do not edit this block by hand, cfgm manages it.
# Append-only jsonl ledgers (memory/claims/ledger.jsonl etc.) merge as unions
# instead of producing conflict markers, which parseJsonlLenient() would
# otherwise silently drop as corrupt lines (a claim vanishing with no error).
memory/**/*.jsonl merge=union
`;

/**
 * `.gitattributes` 는 사용자가 이미 다른 내용을 갖고 있을 수 있는 저장소 루트
 * 파일이라, settings.json 과 같은 원칙을 따른다: 마커 블록만 upsert, 나머지는
 * 절대 건드리지 않음. 대상이 git 저장소가 아니어도(파일만 있어도) 무해하므로
 * git 여부는 검사하지 않는다 — 나중에 git init 해도 그대로 적용된다.
 */
async function ensureGitAttributes(targetProject: string, dryRun: boolean): Promise<string | null> {
  const path = join(targetProject, ".gitattributes");
  const existing = existsSync(path) ? await readFile(path, "utf-8") : "";
  if (existing.includes(GITATTRIBUTES_MARKER)) return null; // already there, idempotent no-op
  if (dryRun) return `would ${existing ? "append to" : "write"} ${path} (merge=union for memory/**/*.jsonl)`;
  // 기존 내용의 trailing newline 은 정규화해서 딱 하나만 남기고, 그 뒤에 항상
  // "\n" + BLOCK 하나만 붙인다(빈 줄 하나로 구분) — uninstall 이 정확히 그 "\n"+BLOCK
  // 만 제거하면 기존 내용의 원래 trailing newline 이 그대로 보존된다. 예전엔
  // 분기별로 구분자 개수가 달라서 uninstall 시 사용자의 원래 trailing newline 까지
  // 같이 지워지는 버그가 있었다.
  const base = existing.length > 0 && !existing.endsWith("\n") ? `${existing}\n` : existing;
  const next = base.length > 0 ? `${base}\n${GITATTRIBUTES_BLOCK}` : GITATTRIBUTES_BLOCK;
  await writeFile(path, next);
  return `${existing ? "updated" : "wrote"} ${path} (merge=union for memory/**/*.jsonl)`;
}

function parseArgs(argv: string[]): { project: string | null; dryRun: boolean; json: boolean } {
  let project: string | null = null;
  let dryRun = false;
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--project" && argv[i + 1]) { project = argv[++i]!; continue; }
    if (argv[i] === "--dry-run") { dryRun = true; continue; }
    if (argv[i] === "--json") { json = true; continue; }
    if (argv[i] === "--help" || argv[i] === "-h") { printUsage(); process.exit(0); }
  }
  return { project, dryRun, json };
}

function printUsage(): void {
  console.log(`cfgm install-project — 프로젝트 단위 설치

사용법:
  bun run bin/install-project.ts [--project <path>] [--dry-run] [--json]

  --project <path>  대상 프로젝트 경로 (기본: 현재 디렉토리)
  --dry-run         실제로 쓰지 않고 계획만 출력
  --json            결과를 JSON으로 출력

무엇을 하는가:
  - <project>/.claude/settings.json 에 세션 훅 등록 (marker: ${MARKER})
    — 기존 hooks/기타 설정은 보존, 처음 수정 시 .bak-<timestamp> 백업 생성
  - <project>/.claude/commands/*.md 에 슬래시 커맨드 등록 (관리 대상 파일만, 동명 사용자 파일은 보존)
  - <project>/.memory-brain/ 데이터 디렉토리 준비 (이미 있으면 그대로 둠)
  - 전역 ~/.claude-brain, ~/.claude, 프로젝트의 CLAUDE.md 는 전혀 건드리지 않음

제거: bun run bin/uninstall-project.ts [--project <path>] [--purge]`);
}

async function main(): Promise<void> {
  const { project, dryRun, json } = parseArgs(process.argv.slice(2));
  const toolRoot = resolveToolRoot(import.meta.url);
  const targetProject = resolve(project ?? process.cwd());

  if (!existsSync(targetProject)) {
    console.error(`[install-project] 대상 디렉토리가 존재하지 않음: ${targetProject}`);
    process.exit(1);
  }
  if (!statSync(targetProject).isDirectory()) {
    console.error(`[install-project] 대상이 디렉토리가 아님: ${targetProject}`);
    process.exit(1);
  }

  const paths = resolveProjectPaths(toolRoot, targetProject);

  /**
   * 실제로 재현된 사고: `.claude/commands` 또는 `.memory-brain` 이 (동명의 사용자 파일 등으로)
   * 디렉토리가 아닌 상태로 이미 존재하면, settings.json 은 이미 쓰여진 뒤 뒤늦게
   * mkdir(EEXIST/ENOTDIR) 로 크래시해 "절반만 설치된" 상태를 남겼다. 파일시스템에
   * 아무것도 쓰기 전에 전부 미리 검증해, 실패하면 아무것도 변경되지 않게 한다.
   */
  for (const [path, label] of [
    [paths.claudeDir, ".claude"],
    [paths.commandsDir, ".claude/commands"],
    [paths.memoryDir, ".memory-brain"],
  ] as const) {
    if (existsSync(path) && !statSync(path).isDirectory()) {
      console.error(`[install-project] ${path} 이 디렉토리가 아닙니다 (예상 위치: ${label}).`);
      console.error(`  안전을 위해 아무것도 쓰지 않고 중단합니다. 직접 확인 후 다시 실행하세요.`);
      process.exit(1);
    }
  }

  const version = await readCfgmVersion(toolRoot);
  const entries = buildHookEntries(paths);

  const loaded = await loadJson(paths.settingsPath);
  if (!loaded.ok) {
    console.error(`[install-project] ${paths.settingsPath} 파싱 실패 — 유효한 JSON이 아닙니다.`);
    console.error(`  안전을 위해 아무것도 쓰지 않고 중단합니다. 직접 문법을 고치거나 파일을 정리한 뒤 다시 실행하세요.`);
    process.exit(1);
  }
  const existingSettings = loaded.data;

  const malformedType = findMalformedHookType(existingSettings);
  if (malformedType) {
    console.error(`[install-project] ${paths.settingsPath} 의 hooks.${malformedType} 이 배열이 아닙니다 (예상치 못한 형식).`);
    console.error(`  안전을 위해 아무것도 쓰지 않고 중단합니다. 해당 항목을 직접 확인한 뒤 다시 실행하세요.`);
    process.exit(1);
  }

  const alreadyManaged = JSON.stringify(existingSettings.hooks ?? {}).includes(MARKER);
  const mergedSettings = mergeHooksIntoSettings(existingSettings, entries);

  const actions: string[] = [];

  if (dryRun) {
    actions.push(`write ${paths.settingsPath} (hooks marker=${MARKER})`);
    if (!alreadyManaged && existsSync(paths.settingsPath)) {
      actions.push(`backup existing settings.json → ${paths.settingsPath}.bak-<timestamp>`);
    }
  } else {
    await mkdir(paths.claudeDir, { recursive: true });
    const backupPath = await backupIfNeeded(paths.settingsPath, alreadyManaged);
    await writeFile(paths.settingsPath, JSON.stringify(mergedSettings, null, 2));
    actions.push(`wrote ${paths.settingsPath}`);
    if (backupPath) actions.push(`backup created: ${backupPath}`);
  }

  const { written: commandsWritten, skipped: commandsSkipped } = await scaffoldCommands(paths, version, dryRun);
  actions.push(...commandsWritten.map((f) => `${dryRun ? "would write" : "wrote"} command ${f}`));
  actions.push(...commandsSkipped.map((f) => `skip (user file exists): ${f}`));

  const gitAttrsAction = await ensureGitAttributes(targetProject, dryRun);
  if (gitAttrsAction) actions.push(gitAttrsAction);

  if (!dryRun) {
    await mkdir(join(paths.memoryDir, "state"), { recursive: true });
    await mkdir(join(paths.memoryDir, "ledger", "raw"), { recursive: true });
    actions.push(`ensured ${paths.memoryDir}/{state,ledger/raw}`);

    const manifest = {
      cfgmVersion: version,
      targetProject,
      toolRoot,
      hooksRegistered: Object.keys(entries),
      commandsWritten,
      installedAt: new Date().toISOString(),
    };
    await writeFile(paths.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    actions.push(`wrote ${paths.manifestPath}`);
  }

  if (json) {
    console.log(JSON.stringify({ dryRun, targetProject, actions }, null, 2));
  } else {
    console.log(`[install-project] ${dryRun ? "(dry-run) " : ""}대상: ${targetProject}`);
    for (const a of actions) console.log(`  - ${a}`);
    if (!dryRun) {
      console.log(`\n완료. 이 디렉토리에서 평범하게 'claude' 를 실행하면 적용됩니다.`);
      console.log(`제거: bun run bin/uninstall-project.ts --project ${targetProject}`);
    }
  }
}

if (import.meta.main) {
  main().catch((e) => { console.error("[install-project] failed:", e.message); process.exit(1); });
}
