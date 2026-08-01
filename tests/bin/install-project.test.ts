import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, writeFile, mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import { MARKER } from "../../bin/install-project";

const INSTALL = join(import.meta.dir, "../../bin/install-project.ts");

function runScript(args: string[] = []) {
  return Bun.spawnSync({
    cmd: ["bun", "run", INSTALL, ...args],
    env: process.env as Record<string, string>,
    stdout: "pipe",
    stderr: "pipe",
  });
}

async function readSettings(projectDir: string) {
  const p = join(projectDir, ".claude", "settings.json");
  try { return JSON.parse(await readFile(p, "utf-8")); }
  catch { return null; }
}

describe("install-project.ts", () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "cfgm-project-"));
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  test("errors cleanly when target project directory doesn't exist", () => {
    const proc = runScript(["--project", join(projectDir, "does-not-exist")]);
    expect(proc.exitCode).not.toBe(0);
    expect(proc.stderr.toString()).toContain("존재하지 않음");
  });

  test("creates .claude/settings.json with marker hooks for all 6 hook types", async () => {
    const proc = runScript(["--project", projectDir]);
    expect(proc.exitCode).toBe(0);
    const settings = await readSettings(projectDir);
    expect(settings).not.toBeNull();
    for (const t of ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop", "PreCompact"]) {
      expect(settings.hooks[t]).toBeDefined();
      const entry = settings.hooks[t].find((h: any) => h.matcher === MARKER);
      expect(entry).toBeDefined();
      expect(entry.hooks[0].type).toBe("command");
      expect(entry.hooks[0].command).toContain(`CFGM_PROJECT_ROOT='${projectDir}'`);
    }
  });

  test("preserves unrelated existing settings and other hook matchers", async () => {
    const claudeDir = join(projectDir, ".claude");
    await mkdir(claudeDir, { recursive: true });
    const existing = {
      enabledPlugins: { "some-plugin@marketplace": true },
      hooks: { PreToolUse: [{ matcher: "user-custom", hooks: ["echo hi"] }] },
    };
    await writeFile(join(claudeDir, "settings.json"), JSON.stringify(existing, null, 2));

    const proc = runScript(["--project", projectDir]);
    expect(proc.exitCode).toBe(0);

    const settings = await readSettings(projectDir);
    expect(settings.enabledPlugins).toEqual({ "some-plugin@marketplace": true });
    expect(settings.hooks.PreToolUse.find((h: any) => h.matcher === "user-custom")).toBeDefined();
    expect(settings.hooks.PreToolUse.find((h: any) => h.matcher === MARKER)).toBeDefined();
  });

  test("backs up pre-existing settings.json only on first managed write, not on idempotent re-run", async () => {
    const claudeDir = join(projectDir, ".claude");
    await mkdir(claudeDir, { recursive: true });
    await writeFile(join(claudeDir, "settings.json"), JSON.stringify({ enabledPlugins: {} }, null, 2));

    runScript(["--project", projectDir]);
    const { readdir } = await import("node:fs/promises");
    let entries = await readdir(claudeDir);
    let backups = entries.filter((f) => f.startsWith("settings.json.bak-"));
    expect(backups.length).toBe(1);

    runScript(["--project", projectDir]);
    entries = await readdir(claudeDir);
    backups = entries.filter((f) => f.startsWith("settings.json.bak-"));
    expect(backups.length).toBe(1);
  });

  test("no backup created when settings.json didn't exist before install", async () => {
    runScript(["--project", projectDir]);
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(join(projectDir, ".claude"));
    expect(entries.some((f) => f.startsWith("settings.json.bak-"))).toBe(false);
  });

  test("idempotent — double install keeps exactly one marker entry per hook type", async () => {
    runScript(["--project", projectDir]);
    runScript(["--project", projectDir]);
    const settings = await readSettings(projectDir);
    for (const t of Object.keys(settings.hooks)) {
      const matches = settings.hooks[t].filter((h: any) => h.matcher === MARKER);
      expect(matches.length).toBeLessThanOrEqual(1);
    }
  });

  test("scaffolds managed command files, preserves same-name user file", async () => {
    const commandsDir = join(projectDir, ".claude", "commands");
    await mkdir(commandsDir, { recursive: true });

    const { readdir } = await import("node:fs/promises");
    const skillsSrc = join(import.meta.dir, "../../skills");
    const skillNames = (await readdir(skillsSrc, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    expect(skillNames.length).toBeGreaterThan(0);
    const firstSkill = skillNames[0]!;
    await writeFile(join(commandsDir, `${firstSkill}.md`), "# my own custom command\nnot managed by cfgm");

    const proc = runScript(["--project", projectDir]);
    expect(proc.exitCode).toBe(0);

    const userFile = await readFile(join(commandsDir, `${firstSkill}.md`), "utf-8");
    expect(userFile).toBe("# my own custom command\nnot managed by cfgm");

    if (skillNames.length > 1) {
      const otherSkill = skillNames[1]!;
      expect(existsSync(join(commandsDir, `${otherSkill}.md`))).toBe(true);
      const content = await readFile(join(commandsDir, `${otherSkill}.md`), "utf-8");
      expect(content).toContain("CFGM-OS:COMMAND managed");
    }
  });

  test("does not touch the project's CLAUDE.md", async () => {
    const claudeMdPath = join(projectDir, "CLAUDE.md");
    await writeFile(claudeMdPath, "# My project bootloader\n\ndo not touch this.\n");

    const proc = runScript(["--project", projectDir]);
    expect(proc.exitCode).toBe(0);

    const after = await readFile(claudeMdPath, "utf-8");
    expect(after).toBe("# My project bootloader\n\ndo not touch this.\n");
  });

  test("ensures .memory-brain/{state,ledger/raw} and writes manifest", async () => {
    const proc = runScript(["--project", projectDir]);
    expect(proc.exitCode).toBe(0);

    expect(existsSync(join(projectDir, ".memory-brain", "state"))).toBe(true);
    expect(existsSync(join(projectDir, ".memory-brain", "ledger", "raw"))).toBe(true);

    const manifestPath = join(projectDir, ".claude", "cfgm-project-manifest.json");
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(await readFile(manifestPath, "utf-8"));
    expect(manifest.targetProject).toBe(projectDir);
    expect(manifest.hooksRegistered).toContain("SessionStart");
  });

  test("--dry-run makes zero filesystem changes", async () => {
    const proc = runScript(["--project", projectDir, "--dry-run"]);
    expect(proc.exitCode).toBe(0);
    expect(existsSync(join(projectDir, ".claude"))).toBe(false);
    expect(existsSync(join(projectDir, ".memory-brain"))).toBe(false);
    expect(proc.stdout.toString()).toContain("(dry-run)");
  });

  test("--json outputs parseable JSON with actions array", () => {
    const proc = runScript(["--project", projectDir, "--json"]);
    expect(proc.exitCode).toBe(0);
    const parsed = JSON.parse(proc.stdout.toString());
    expect(parsed.targetProject).toBe(projectDir);
    expect(Array.isArray(parsed.actions)).toBe(true);
  });

  test("aborts (no write) when existing settings.json is invalid JSON — never silently overwrites", async () => {
    const claudeDir = join(projectDir, ".claude");
    await mkdir(claudeDir, { recursive: true });
    const broken = '{\n  // comment — not valid JSON\n  "model": "opus"\n}\n';
    await writeFile(join(claudeDir, "settings.json"), broken);

    const proc = runScript(["--project", projectDir]);
    expect(proc.exitCode).not.toBe(0);
    expect(proc.stderr.toString()).toContain("파싱 실패");

    const after = await readFile(join(claudeDir, "settings.json"), "utf-8");
    expect(after).toBe(broken);
    expect(existsSync(join(claudeDir, "commands"))).toBe(false);
  });

  test("aborts (no write) when settings.hooks.<type> is not an array", async () => {
    const claudeDir = join(projectDir, ".claude");
    await mkdir(claudeDir, { recursive: true });
    const malformed = { hooks: { PreToolUse: "not-an-array" } };
    await writeFile(join(claudeDir, "settings.json"), JSON.stringify(malformed, null, 2));

    const proc = runScript(["--project", projectDir]);
    expect(proc.exitCode).not.toBe(0);
    expect(proc.stderr.toString()).toContain("배열이 아닙니다");

    const after = JSON.parse(await readFile(join(claudeDir, "settings.json"), "utf-8"));
    expect(after).toEqual(malformed);
  });

  test("hook command quotes a target path containing spaces", async () => {
    const spacedDir = join(projectDir, "my project");
    await mkdir(spacedDir, { recursive: true });
    const proc = runScript(["--project", spacedDir]);
    expect(proc.exitCode).toBe(0);

    const settings = await readSettings(spacedDir);
    const command = settings.hooks.SessionStart[0].hooks[0].command as string;
    expect(command).toContain(`CFGM_PROJECT_ROOT='${spacedDir}'`);
    expect(command).toMatch(/bun run '.*session-start\.ts'/);
  });

  test("--project pointing at a file (not a directory) errors cleanly", async () => {
    const filePath = join(projectDir, "not-a-dir");
    await writeFile(filePath, "hello");
    const proc = runScript(["--project", filePath]);
    expect(proc.exitCode).not.toBe(0);
    expect(proc.stderr.toString()).toContain("디렉토리가 아님");
  });

  test("aborts with zero writes when .claude/commands exists as a plain file, not a directory", async () => {
    const claudeDir = join(projectDir, ".claude");
    await mkdir(claudeDir, { recursive: true });
    await writeFile(join(claudeDir, "commands"), "");

    const proc = runScript(["--project", projectDir]);
    expect(proc.exitCode).not.toBe(0);
    expect(proc.stderr.toString()).toContain("디렉토리가 아닙니다");
    expect(existsSync(join(claudeDir, "settings.json"))).toBe(false);
    expect(existsSync(join(projectDir, ".memory-brain"))).toBe(false);
  });

  test("aborts with zero writes when .memory-brain already exists as an unrelated plain file", async () => {
    const memoryPath = join(projectDir, ".memory-brain");
    await writeFile(memoryPath, "my personal notes, not memory-brain data");

    const proc = runScript(["--project", projectDir]);
    expect(proc.exitCode).not.toBe(0);
    expect(proc.stderr.toString()).toContain("디렉토리가 아닙니다");
    expect(await readFile(memoryPath, "utf-8")).toBe("my personal notes, not memory-brain data");
    expect(existsSync(join(projectDir, ".claude", "settings.json"))).toBe(false);
  });

  test("writes .gitattributes with merge=union for memory jsonl ledgers", async () => {
    const proc = runScript(["--project", projectDir]);
    expect(proc.exitCode).toBe(0);
    const content = await readFile(join(projectDir, ".gitattributes"), "utf-8");
    expect(content).toContain("memory/**/*.jsonl merge=union");
    expect(content).toContain("cfgm-os:merge=union for jsonl ledgers");
  });

  test(".gitattributes — preserves unrelated existing content, appends marker block once", async () => {
    await writeFile(join(projectDir, ".gitattributes"), "*.png binary\n");
    runScript(["--project", projectDir]);
    const content = await readFile(join(projectDir, ".gitattributes"), "utf-8");
    expect(content).toContain("*.png binary");
    expect(content).toContain("memory/**/*.jsonl merge=union");

    // idempotent re-run — no duplicate block
    runScript(["--project", projectDir]);
    const again = await readFile(join(projectDir, ".gitattributes"), "utf-8");
    const occurrences = again.split("memory/**/*.jsonl merge=union").length - 1;
    expect(occurrences).toBe(1);
  });

  test(".gitattributes — --dry-run makes zero writes", async () => {
    const proc = runScript(["--project", projectDir, "--dry-run"]);
    expect(proc.exitCode).toBe(0);
    expect(existsSync(join(projectDir, ".gitattributes"))).toBe(false);
    expect(proc.stdout.toString()).toContain(".gitattributes");
  });

  test("via the cfgm dispatcher (bin/cfgm.ts), no --project targets the invoking cwd, not the tool repo", async () => {
    const cfgm = join(import.meta.dir, "../../bin/cfgm.ts");
    const realProjectDir = await realpath(projectDir);
    const proc = Bun.spawnSync({
      cmd: ["bun", "run", cfgm, "install-project", "--dry-run"],
      cwd: projectDir,
      env: process.env as Record<string, string>,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(proc.exitCode).toBe(0);
    const out = proc.stdout.toString();
    expect(out).toContain(`대상: ${realProjectDir}`);
    expect(out).not.toContain(join(import.meta.dir, "../.."));
  });
});
