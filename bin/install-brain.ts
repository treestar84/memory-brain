import { readFile, writeFile, mkdir, symlink, chmod, readlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";

const MARKER = "cfgm-os-brain";
const HOME = process.env.HOME!;
const PROJECT = process.env.CFGM_PROJECT || process.cwd();
const BRAIN_HOME = process.env.CFGM_BRAIN_HOME || join(HOME, ".claude-brain");
const SETTINGS_PATH = join(BRAIN_HOME, "settings.json");
const SKILL_LINK = join(BRAIN_HOME, "skills", "CFGM-OS");
const MEM_HOME = join(BRAIN_HOME, "memory-brain");
const IDENTITY_HOME = join(MEM_HOME, "identity");
const GOALS_HOME = join(IDENTITY_HOME, "goals");
const CLAUDE_MD_PATH = join(BRAIN_HOME, "CLAUDE.md");
const BIN_DIR = join(BRAIN_HOME, "bin");
const LAUNCHER = join(BIN_DIR, "claude-pai");
const LOCAL_BIN = join(HOME, ".local", "bin");
const LOCAL_BIN_LINK = join(LOCAL_BIN, "claude-pai");
const HOOKS_DIR = resolve(PROJECT, "src/hooks");

export const BEGIN_MARKER = "<!-- PAI-MEMORY:BEGIN managed -->";
export const END_MARKER = "<!-- PAI-MEMORY:END -->";

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

function buildHookEntries(): Record<HookType, HookEntry> {
  const entry = (type: HookType): HookEntry => ({
    matcher: MARKER,
    hooks: [{
      type: "command",
      command: `/usr/bin/env CFGM_HOME=${MEM_HOME} bun run ${HOOKS_DIR}/${HOOK_FILES[type]}.ts`,
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

async function loadSettings(): Promise<Record<string, any>> {
  try {
    return JSON.parse(await readFile(SETTINGS_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function launcherScript(): string {
  return `#!/usr/bin/env bash
export CLAUDE_CONFIG_DIR="${BRAIN_HOME}"
exec claude "$@"
`;
}

async function ensureLocalBinSymlink(): Promise<void> {
  if (!existsSync(LOCAL_BIN)) {
    console.log(`[cfgm-brain] ~/.local/bin 없음. PATH에 '${BIN_DIR}' 추가를 권장합니다.`);
    console.log(`  echo 'export PATH="${BIN_DIR}:$PATH"' >> ~/.zshrc`);
    return;
  }
  if (existsSync(LOCAL_BIN_LINK)) {
    try {
      const target = await readlink(LOCAL_BIN_LINK);
      if (target === LAUNCHER) return;
      console.log(`[cfgm-brain] ${LOCAL_BIN_LINK}이 다른 대상(${target})을 가리킴 — 덮어쓰지 않음.`);
      return;
    } catch {
      console.log(`[cfgm-brain] ${LOCAL_BIN_LINK}이 심링크 아님 — 덮어쓰지 않음.`);
      return;
    }
  }
  await symlink(LAUNCHER, LOCAL_BIN_LINK);
}

export function managedBody(): string {
  return [
    "@memory-brain/identity/telos.md",
    "@memory-brain/identity/persona.md",
    "@memory-brain/identity/user.md",
    "@memory-brain/identity/tools.md",
    "@memory-brain/identity/voice.md",
    "@memory-brain/identity/goals/_index.md",
  ].join("\n");
}

export type MergeAction = "created" | "replaced" | "appended" | "skipped";
export type MergeResult = { result: string; action: MergeAction; warn?: string };

export function mergeManagedBlock(
  existing: string,
  body: string,
  begin: string = BEGIN_MARKER,
  end: string = END_MARKER,
): MergeResult {
  const beginCount = countOccurrences(existing, begin);
  const endCount = countOccurrences(existing, end);

  if (beginCount !== endCount || beginCount > 1) {
    return { result: existing, action: "skipped", warn: `CLAUDE.md managed marker 불균형/중복 (begin=${beginCount}, end=${endCount})` };
  }

  const block = `${begin}\n${body}\n${end}`;

  if (beginCount === 0) {
    if (existing.length === 0) {
      return { result: `${block}\n`, action: "created" };
    }
    const sep = existing.endsWith("\n") ? "\n" : "\n\n";
    return { result: `${existing}${sep}${block}\n`, action: "appended" };
  }

  const beginIdx = existing.indexOf(begin);
  const endIdx = existing.indexOf(end, beginIdx + begin.length);
  if (beginIdx < 0 || endIdx < 0 || endIdx < beginIdx) {
    return { result: existing, action: "skipped", warn: "CLAUDE.md managed marker 위치 비정상" };
  }
  const head = existing.slice(0, beginIdx);
  const tail = existing.slice(endIdx + end.length);
  return { result: `${head}${block}${tail}`, action: "replaced" };
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

async function mergeClaudeMdManagedBlock(): Promise<void> {
  let existing = "";
  try { existing = await readFile(CLAUDE_MD_PATH, "utf-8"); } catch {}
  const { result, action, warn } = mergeManagedBlock(existing, managedBody());
  if (action === "skipped") {
    console.error(`[cfgm-brain] CLAUDE.md 미변경: ${warn}`);
    return;
  }
  if (result !== existing) {
    await writeFile(CLAUDE_MD_PATH, result);
  }
  console.log(`[cfgm-brain] CLAUDE.md managed block: ${action}`);
}

const IDENTITY_TEMPLATES: Record<string, string> = {
  "telos.md": `# TELOS — 나의 존재 목적

> 이 파일은 드물게 고치세요. AI가 당신을 이해하는 뿌리입니다.
> 비워두어도 동작합니다. 채워질수록 모든 세션의 맥락이 풍부해집니다.

## 당신은 무엇을 위해 깨어나는가?
<!-- 예: 좋은 소프트웨어로 사람들의 시간을 돌려주기 위해 -->

## 5년 뒤 어떤 사람이 되어 있길 원하는가?

## 타협 불가능한 원칙 3가지
1.
2.
3.
`,
  "persona.md": `# Persona — AI 협업자의 성격

> 당신이 원하는 AI의 어조·태도·관점을 정의합니다.

## 기본 톤
<!-- 예: 간결하고 직설적. 과장하지 않음. -->

## 의사결정 스타일
<!-- 예: 옵션을 먼저 제시하고 트레이드오프 명시. -->

## 피해야 할 태도
<!-- 예: 아부, 장황한 재진술, 불필요한 면책조항. -->
`,
  "user.md": `# User — 나에 대한 사실

> AI가 당신을 이해하는 데 도움이 되는 고정 정보.

## 역할 / 직업

## 주된 기술 스택 / 도메인

## 현재 집중 영역

## 중요한 맥락
<!-- 예: 특정 팀·프로젝트·제약조건. -->
`,
  "tools.md": `# Tools — 내가 자주 쓰는 도구와 환경

> 터미널·에디터·언어·클라우드 등 반복적으로 등장하는 환경을 선언합니다.

## 운영체제 / 쉘

## 주력 언어 / 런타임

## 에디터 / IDE

## 자주 쓰는 CLI / SaaS
`,
  "voice.md": `# Voice — 응답 스타일 가이드

> AI의 문체·길이·포맷에 대한 선호를 적습니다.

## 응답 길이
<!-- 예: 기본 짧게. 요청 시에만 길게. -->

## 포맷 선호
<!-- 예: 불릿보다 한 문단. 코드블록은 필수일 때만. -->

## 언어 / 호칭
<!-- 예: 한국어 기본. "저" 사용 금지. -->
`,
};

const GOALS_INDEX_TEMPLATE = `<!-- GOALS-INDEX:BEGIN auto-generated -->
# Long-term Goals

(등록된 목표 없음. \`bun run bin/cfgm-identity-goal.ts add "<title>" <id>\`로 추가하세요.)
<!-- GOALS-INDEX:END -->
`;

async function scaffoldIdentity(): Promise<void> {
  await mkdir(IDENTITY_HOME, { recursive: true });
  await mkdir(GOALS_HOME, { recursive: true });
  for (const [name, content] of Object.entries(IDENTITY_TEMPLATES)) {
    const p = join(IDENTITY_HOME, name);
    if (!existsSync(p)) await writeFile(p, content);
  }
  const indexPath = join(GOALS_HOME, "_index.md");
  if (!existsSync(indexPath)) await writeFile(indexPath, GOALS_INDEX_TEMPLATE);
}

async function main() {
  await mkdir(BRAIN_HOME, { recursive: true });
  await mkdir(join(BRAIN_HOME, "skills"), { recursive: true });
  await mkdir(BIN_DIR, { recursive: true });
  await mkdir(MEM_HOME, { recursive: true });
  await mkdir(join(PROJECT, ".memory-brain", "state"), { recursive: true });
  await mkdir(join(PROJECT, ".memory-brain", "ledger", "raw"), { recursive: true });

  const settings = await loadSettings();
  if (!settings.hooks) settings.hooks = {};
  const entries = buildHookEntries();
  for (const [type, entry] of Object.entries(entries)) {
    if (!settings.hooks[type]) settings.hooks[type] = [];
    const arr: HookEntry[] = settings.hooks[type];
    const idx = arr.findIndex((h) => h.matcher === MARKER);
    if (idx >= 0) arr[idx] = entry;
    else arr.push(entry);
  }
  await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2));

  const skillSrc = resolve(PROJECT, "skills");
  if (existsSync(skillSrc) && !existsSync(SKILL_LINK)) {
    try { await symlink(skillSrc, SKILL_LINK); } catch {}
  }

  await writeFile(LAUNCHER, launcherScript());
  await chmod(LAUNCHER, 0o755);

  await ensureLocalBinSymlink();

  await scaffoldIdentity();
  await mergeClaudeMdManagedBlock();

  if (!Bun.which("claude")) {
    console.log(`[cfgm-brain] 경고: 'claude' 바이너리를 PATH에서 찾지 못함. claude-pai 실행 시 실패합니다.`);
  }

  console.log(`[cfgm-brain] installed at ${BRAIN_HOME}`);
  console.log(`  launcher: ${LAUNCHER}`);
  if (existsSync(LOCAL_BIN_LINK)) {
    console.log(`  symlink:  ${LOCAL_BIN_LINK}`);
  }
  console.log(`  hooks:    ${HOOKS_DIR}`);
  console.log(`  memory:   ${MEM_HOME}`);
  console.log(`  identity: ${IDENTITY_HOME}`);
  console.log(`  CLAUDE.md: ${CLAUDE_MD_PATH}`);
  console.log(`\n사용법: claude-pai`);
}

if (import.meta.main) {
  main().catch((e) => { console.error("[cfgm-brain] install failed:", e.message); process.exit(1); });
}
