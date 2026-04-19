import { readFile, writeFile, mkdir, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";

const MARKER = "cfgm-os";
const HOME = process.env.HOME!;
const PROJECT = process.env.CFGM_PROJECT || process.cwd();
const SETTINGS_PATH = join(HOME, ".claude", "settings.json");
const HOOKS_DIR = resolve(PROJECT, "src/hooks");
const SKILL_LINK = join(HOME, ".claude", "skills", "CFGM-OS");

type HookEntry = { matcher: string; hooks: string[] };
type HookType =
  | "SessionStart" | "UserPromptSubmit" | "PreToolUse" | "PostToolUse" | "Stop" | "PreCompact";

function buildHookEntries(): Record<HookType, HookEntry> {
  const entry = (type: string): HookEntry => ({
    matcher: MARKER,
    hooks: [`bun run ${HOOKS_DIR}/${kebab(type)}.ts`],
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

function kebab(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

async function loadSettings(): Promise<Record<string, any>> {
  try {
    return JSON.parse(await readFile(SETTINGS_PATH, "utf-8"));
  } catch {
    return {};
  }
}

async function main() {
  await mkdir(join(HOME, ".claude"), { recursive: true });

  const settings = await loadSettings();
  if (!settings.hooks) settings.hooks = {};

  const entries = buildHookEntries();
  for (const [type, entry] of Object.entries(entries)) {
    if (!settings.hooks[type]) settings.hooks[type] = [];
    const arr: HookEntry[] = settings.hooks[type];
    const idx = arr.findIndex((h) => h.matcher === MARKER);
    if (idx >= 0) {
      arr[idx] = entry;
    } else {
      arr.push(entry);
    }
  }

  await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2));

  await mkdir(join(HOME, ".claude", "skills"), { recursive: true });
  const skillSrc = resolve(PROJECT, "skills");
  if (existsSync(skillSrc) && !existsSync(SKILL_LINK)) {
    try { await symlink(skillSrc, SKILL_LINK); } catch {}
  }

  await mkdir(join(HOME, ".memory-brain"), { recursive: true });
  await mkdir(join(PROJECT, ".memory-brain", "state"), { recursive: true });
  await mkdir(join(PROJECT, ".memory-brain", "ledger", "raw"), { recursive: true });

  console.log(`[cfgm-os] installed. hooks → ${HOOKS_DIR}`);
}

main().catch((e) => { console.error("[cfgm-os] install failed:", e.message); process.exit(1); });
