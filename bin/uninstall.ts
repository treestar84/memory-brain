import { readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

const MARKER = "cfgm-os";
const HOME = process.env.HOME || homedir();
const SETTINGS_PATH = join(HOME, ".claude", "settings.json");
const SKILL_LINK = join(HOME, ".claude", "skills", "CFGM-OS");

async function main() {
  if (!existsSync(SETTINGS_PATH)) {
    console.log("[cfgm-os] nothing to uninstall.");
    return;
  }

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

  await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2));

  if (existsSync(SKILL_LINK)) {
    try { await unlink(SKILL_LINK); } catch {}
  }

  console.log("[cfgm-os] uninstalled.");
}

main().catch((e) => { console.error("[cfgm-os] uninstall failed:", e.message); process.exit(1); });
