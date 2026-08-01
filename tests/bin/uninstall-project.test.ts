import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, writeFile, mkdir, readdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import { MARKER } from "../../bin/install-project";

const INSTALL = join(import.meta.dir, "../../bin/install-project.ts");
const UNINSTALL = join(import.meta.dir, "../../bin/uninstall-project.ts");

function runScript(script: string, args: string[] = []) {
  return Bun.spawnSync({
    cmd: ["bun", "run", script, ...args],
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

describe("uninstall-project.ts", () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "cfgm-project-"));
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  test("safe no-op on a project that was never installed", () => {
    const proc = runScript(UNINSTALL, ["--project", projectDir]);
    expect(proc.exitCode).toBe(0);
    expect(proc.stdout.toString()).toContain(`대상: ${projectDir}`);
    expect(existsSync(join(projectDir, ".claude"))).toBe(false);
    expect(existsSync(join(projectDir, ".memory-brain"))).toBe(false);
  });

  test("safe no-op with --purge on a clean project", () => {
    const proc = runScript(UNINSTALL, ["--project", projectDir, "--purge"]);
    expect(proc.exitCode).toBe(0);
  });

  test("soft uninstall removes marker hooks, preserves other hooks/settings and .memory-brain", async () => {
    const claudeDir = join(projectDir, ".claude");
    await mkdir(claudeDir, { recursive: true });
    const preExisting = {
      enabledPlugins: { "some-plugin@marketplace": true },
      hooks: { PreToolUse: [{ matcher: "user-custom", hooks: ["echo hi"] }] },
    };
    await writeFile(join(claudeDir, "settings.json"), JSON.stringify(preExisting, null, 2));

    const install = runScript(INSTALL, ["--project", projectDir]);
    expect(install.exitCode).toBe(0);
    await writeFile(join(projectDir, ".memory-brain", "marker.txt"), "keep-me");

    const proc = runScript(UNINSTALL, ["--project", projectDir]);
    expect(proc.exitCode).toBe(0);

    const settings = await readSettings(projectDir);
    expect(settings).not.toBeNull();
    expect(JSON.stringify(settings.hooks)).not.toContain(MARKER);
    expect(settings.enabledPlugins).toEqual({ "some-plugin@marketplace": true });
    expect(settings.hooks.PreToolUse.find((h: any) => h.matcher === "user-custom")).toBeDefined();

    // data preserved
    expect(existsSync(join(projectDir, ".memory-brain", "marker.txt"))).toBe(true);
  });

  test("settings.json deleted entirely when it becomes empty after removing our hooks", async () => {
    runScript(INSTALL, ["--project", projectDir]);
    const proc = runScript(UNINSTALL, ["--project", projectDir]);
    expect(proc.exitCode).toBe(0);
    // Only our marker hooks existed — file should end up gone (or .claude/ dir gone)
    expect(existsSync(join(projectDir, ".claude", "settings.json"))).toBe(false);
  });

  test("clean round trip (fresh project, nothing pre-existing) leaves zero residue: no .bak file, .claude/ fully removed", async () => {
    runScript(INSTALL, ["--project", projectDir]);
    const proc = runScript(UNINSTALL, ["--project", projectDir]);
    expect(proc.exitCode).toBe(0);
    expect(proc.stdout.toString()).not.toContain("backup created");
    // there was nothing of the user's to protect — .claude/ should be gone entirely, not left
    // behind holding only a stray .bak file forever.
    expect(existsSync(join(projectDir, ".claude"))).toBe(false);
    expect(existsSync(join(projectDir, ".memory-brain"))).toBe(true);
  });

  test("--purge on a clean round trip leaves the project directory completely empty", async () => {
    runScript(INSTALL, ["--project", projectDir]);
    const proc = runScript(UNINSTALL, ["--project", projectDir, "--purge"]);
    expect(proc.exitCode).toBe(0);
    expect(await readdir(projectDir)).toEqual([]);
  });

  test("two full install/uninstall cycles leave zero residue (no growing pile of .bak/.claude leftovers)", async () => {
    runScript(INSTALL, ["--project", projectDir]);
    runScript(UNINSTALL, ["--project", projectDir]);
    runScript(INSTALL, ["--project", projectDir]);
    const proc = runScript(UNINSTALL, ["--project", projectDir]);
    expect(proc.exitCode).toBe(0);
    expect(existsSync(join(projectDir, ".claude"))).toBe(false);
  });

  test("an unrelated top-level key added after install (e.g. by another tool) survives uninstall, with a backup", async () => {
    runScript(INSTALL, ["--project", projectDir]);
    const settingsPath = join(projectDir, ".claude", "settings.json");
    const settings = JSON.parse(await readFile(settingsPath, "utf-8"));
    settings.env = { SOME_VAR: "1" };
    await writeFile(settingsPath, JSON.stringify(settings, null, 2));

    const proc = runScript(UNINSTALL, ["--project", projectDir]);
    expect(proc.exitCode).toBe(0);
    expect(proc.stdout.toString()).toContain("backup created");

    const after = JSON.parse(await readFile(settingsPath, "utf-8"));
    expect(after).toEqual({ env: { SOME_VAR: "1" } });
  });

  test("real pre-existing settings.json content still gets a backup and is preserved (not the clean-round-trip case)", async () => {
    const claudeDir = join(projectDir, ".claude");
    await mkdir(claudeDir, { recursive: true });
    await writeFile(join(claudeDir, "settings.json"), JSON.stringify({ model: "opus" }, null, 2));

    runScript(INSTALL, ["--project", projectDir]);
    const proc = runScript(UNINSTALL, ["--project", projectDir]);
    expect(proc.exitCode).toBe(0);
    expect(proc.stdout.toString()).toContain("backup created");

    const after = JSON.parse(await readFile(join(claudeDir, "settings.json"), "utf-8"));
    expect(after).toEqual({ model: "opus" });
  });

  test("--purge removes .memory-brain/ data as well", async () => {
    runScript(INSTALL, ["--project", projectDir]);
    await writeFile(join(projectDir, ".memory-brain", "marker.txt"), "will-be-gone");

    const proc = runScript(UNINSTALL, ["--project", projectDir, "--purge"]);
    expect(proc.exitCode).toBe(0);
    expect(existsSync(join(projectDir, ".memory-brain"))).toBe(false);
  });

  test("default (no --purge) preserves .memory-brain/ after uninstall", async () => {
    runScript(INSTALL, ["--project", projectDir]);
    await writeFile(join(projectDir, ".memory-brain", "marker.txt"), "keep-me-too");

    const proc = runScript(UNINSTALL, ["--project", projectDir]);
    expect(proc.exitCode).toBe(0);
    expect(existsSync(join(projectDir, ".memory-brain", "marker.txt"))).toBe(true);
  });

  test("removes managed command files, preserves user command file with same name", async () => {
    runScript(INSTALL, ["--project", projectDir]);
    const commandsDir = join(projectDir, ".claude", "commands");
    const entries = await readdir(commandsDir);
    expect(entries.length).toBeGreaterThan(0);

    // overwrite one managed file with unmanaged user content
    const target = join(commandsDir, entries[0]!);
    await writeFile(target, "# not managed anymore\nuser owns this now");

    const proc = runScript(UNINSTALL, ["--project", projectDir]);
    expect(proc.exitCode).toBe(0);

    expect(await readFile(target, "utf-8")).toBe("# not managed anymore\nuser owns this now");
    if (entries.length > 1) {
      expect(existsSync(join(commandsDir, entries[1]!))).toBe(false);
    }
  });

  test("--dry-run makes zero filesystem changes", async () => {
    runScript(INSTALL, ["--project", projectDir]);
    const before = await readFile(join(projectDir, ".claude", "settings.json"), "utf-8");

    const proc = runScript(UNINSTALL, ["--project", projectDir, "--dry-run"]);
    expect(proc.exitCode).toBe(0);
    expect(proc.stdout.toString()).toContain("(dry-run)");

    const after = await readFile(join(projectDir, ".claude", "settings.json"), "utf-8");
    expect(after).toBe(before);
    expect(existsSync(join(projectDir, ".memory-brain"))).toBe(true);
  });

  test("never touches paths outside .claude/ and .memory-brain/", async () => {
    runScript(INSTALL, ["--project", projectDir]);
    const sentinelPath = join(projectDir, "README.md");
    await writeFile(sentinelPath, "# sentinel — must survive uninstall untouched\n");
    const otherDir = join(projectDir, "src");
    await mkdir(otherDir, { recursive: true });
    await writeFile(join(otherDir, "index.ts"), "export const x = 1;\n");

    const proc = runScript(UNINSTALL, ["--project", projectDir, "--purge"]);
    expect(proc.exitCode).toBe(0);

    expect(await readFile(sentinelPath, "utf-8")).toBe("# sentinel — must survive uninstall untouched\n");
    expect(await readFile(join(otherDir, "index.ts"), "utf-8")).toBe("export const x = 1;\n");
  });

  test("--json outputs parseable JSON with actions array", async () => {
    runScript(INSTALL, ["--project", projectDir]);
    const proc = runScript(UNINSTALL, ["--project", projectDir, "--json"]);
    expect(proc.exitCode).toBe(0);
    const parsed = JSON.parse(proc.stdout.toString());
    expect(parsed.targetProject).toBe(projectDir);
    expect(Array.isArray(parsed.actions)).toBe(true);
  });

  test("does not touch settings.json when hooks.<type> is not an array", async () => {
    const claudeDir = join(projectDir, ".claude");
    await mkdir(claudeDir, { recursive: true });
    const malformed = { hooks: { PreToolUse: "not-an-array" } };
    await writeFile(join(claudeDir, "settings.json"), JSON.stringify(malformed, null, 2));

    const proc = runScript(UNINSTALL, ["--project", projectDir]);
    expect(proc.exitCode).toBe(0);
    expect(proc.stdout.toString()).toContain("not an array");

    const after = JSON.parse(await readFile(join(claudeDir, "settings.json"), "utf-8"));
    expect(after).toEqual(malformed);
  });

  test("--project pointing at a file (not a directory) errors cleanly", async () => {
    const filePath = join(projectDir, "not-a-dir");
    await writeFile(filePath, "hello");
    const proc = runScript(UNINSTALL, ["--project", filePath]);
    expect(proc.exitCode).not.toBe(0);
    expect(proc.stderr.toString()).toContain("디렉토리가 아님");
  });

  test("--purge refuses to delete .memory-brain when it's an unrelated plain file, not a directory", async () => {
    const memoryPath = join(projectDir, ".memory-brain");
    await writeFile(memoryPath, "unrelated user file — must survive");

    const proc = runScript(UNINSTALL, ["--project", projectDir, "--purge"]);
    expect(proc.exitCode).toBe(0);
    expect(proc.stdout.toString()).toContain("refused to purge");
    expect(await readFile(memoryPath, "utf-8")).toBe("unrelated user file — must survive");
  });

  test("--purge on a symlinked .memory-brain removes only the symlink, never the real target's contents", async () => {
    const { symlink } = await import("node:fs/promises");
    const realData = await mkdtemp(join(tmpdir(), "cfgm-real-data-"));
    await writeFile(join(realData, "keep-me.txt"), "important data elsewhere");
    await symlink(realData, join(projectDir, ".memory-brain"));

    const proc = runScript(UNINSTALL, ["--project", projectDir, "--purge"]);
    expect(proc.exitCode).toBe(0);

    expect(existsSync(join(projectDir, ".memory-brain"))).toBe(false);
    expect(await readFile(join(realData, "keep-me.txt"), "utf-8")).toBe("important data elsewhere");
    await rm(realData, { recursive: true, force: true });
  });
});

describe("install-project.sh / uninstall-project.sh wrappers", () => {
  const REPO_ROOT = join(import.meta.dir, "../..");
  let projectDir: string;
  let realProjectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "cfgm-project-sh-"));
    // macOS: TMPDIR often has a /tmp -> /private/tmp symlink component; a child process's
    // actual getcwd() always resolves it, so assertions must compare against the resolved form.
    realProjectDir = await realpath(projectDir);
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  function runShell(script: string, args: string[], cwd: string) {
    return Bun.spawnSync({
      cmd: [script, ...args],
      cwd,
      env: process.env as Record<string, string>,
      stdout: "pipe",
      stderr: "pipe",
    });
  }

  test("install-project.sh with no --project targets the invoking cwd, not the tool repo", async () => {
    const proc = runShell(join(REPO_ROOT, "install-project.sh"), ["--dry-run"], projectDir);
    expect(proc.exitCode).toBe(0);
    const out = proc.stdout.toString();
    expect(out).toContain(`대상: ${realProjectDir}`);
    expect(out).not.toContain(REPO_ROOT);
  });

  test("uninstall-project.sh --purge --dry-run with no --project targets the invoking cwd, not the tool repo (regression: this used to resolve to the tool repo and would have deleted its real .memory-brain/)", async () => {
    const proc = runShell(join(REPO_ROOT, "uninstall-project.sh"), ["--purge", "--dry-run"], projectDir);
    expect(proc.exitCode).toBe(0);
    const out = proc.stdout.toString();
    expect(out).toContain(`대상: ${realProjectDir}`);
    expect(out).not.toContain(join(REPO_ROOT, ".memory-brain"));
  });

  test("uninstall-project.sh with a relative --project resolves against the invoking cwd, not the tool repo", async () => {
    await mkdir(join(projectDir, "sub"), { recursive: true });
    const proc = runShell(join(REPO_ROOT, "uninstall-project.sh"), ["--project", "sub", "--dry-run"], projectDir);
    expect(proc.exitCode).toBe(0);
    expect(proc.stdout.toString()).toContain(`대상: ${join(realProjectDir, "sub")}`);
  });

  test("uninstall-project.sh with no args at all does not crash (bash 3.2 empty-array safety)", () => {
    const proc = runShell(join(REPO_ROOT, "uninstall-project.sh"), [], projectDir);
    expect(proc.exitCode).toBe(0);
    expect(proc.stderr.toString()).not.toContain("unbound variable");
  });
});
