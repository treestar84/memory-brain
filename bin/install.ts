import { readFile, writeFile, mkdir, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

const MARKER = "cfgm-os";
const HOME = process.env.HOME || homedir();
const PROJECT = process.env.CFGM_PROJECT || process.cwd();
const SETTINGS_PATH = join(HOME, ".claude", "settings.json");
const HOOKS_DIR = resolve(PROJECT, "src/hooks");
const SKILL_LINK = join(HOME, ".claude", "skills", "CFGM-OS");

type HookEntry = { matcher: string; hooks: string[] };
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
    hooks: [`bun run ${HOOKS_DIR}/${HOOK_FILES[type]}.ts`],
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

async function main() {
  console.warn(
    "[cfgm-os] install.ts is deprecated. Use 'bun run bin/install-brain.ts' (isolated ~/.claude-brain profile). " +
      "install.ts still writes hooks into the default ~/.claude profile for backward compatibility and will be removed in v0.3.",
  );

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
