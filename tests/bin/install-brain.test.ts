import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, writeFile, mkdir, readlink, lstat, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";

const MARKER = "cfgm-os-brain";
const LEGACY_MARKER = "cfgm-os";
const INSTALL = join(import.meta.dir, "../../bin/install-brain.ts");
const UNINSTALL = join(import.meta.dir, "../../bin/uninstall-brain.ts");
const LEGACY_INSTALL = join(import.meta.dir, "../../bin/install.ts");

function runScript(script: string, env: Record<string, string>, args: string[] = []) {
  return Bun.spawnSync({
    cmd: ["bun", "run", script, ...args],
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
}

async function readSettings(brainHome: string) {
  const p = join(brainHome, "settings.json");
  try { return JSON.parse(await readFile(p, "utf-8")); }
  catch { return null; }
}

describe("install-brain.ts", () => {
  let fakeHome: string;
  let brainHome: string;
  let env: Record<string, string>;

  beforeEach(async () => {
    fakeHome = await mkdtemp(join(tmpdir(), "cfgm-brain-"));
    brainHome = join(fakeHome, ".claude-brain");
    await mkdir(join(fakeHome, ".local", "bin"), { recursive: true });
    env = {
      HOME: fakeHome,
      CFGM_PROJECT: fakeHome,
      CFGM_BRAIN_HOME: brainHome,
    };
  });

  afterEach(async () => {
    await rm(fakeHome, { recursive: true, force: true });
  });

  test("T1: creates settings.json with marker and CFGM_HOME", async () => {
    const proc = runScript(INSTALL, env);
    expect(proc.exitCode).toBe(0);
    const settings = await readSettings(brainHome);
    expect(settings).not.toBeNull();
    expect(settings.hooks).toBeDefined();
    const s = JSON.stringify(settings.hooks);
    expect(s).toContain(MARKER);
    expect(s).toContain(`CFGM_HOME=${join(brainHome, "memory-brain")}`);
    // 6 hook types present, each hook entry shape: { matcher, hooks: [{type:"command", command}] }
    for (const t of [
      "SessionStart", "UserPromptSubmit", "PreToolUse",
      "PostToolUse", "Stop", "PreCompact"
    ]) {
      expect(settings.hooks[t]).toBeDefined();
      const entry = settings.hooks[t].find((h: any) => h.matcher === MARKER);
      expect(entry).toBeDefined();
      expect(Array.isArray(entry.hooks)).toBe(true);
      expect(entry.hooks[0]).toMatchObject({ type: "command" });
      expect(typeof entry.hooks[0].command).toBe("string");
    }
  });

  test("T2: does NOT touch ~/.claude/settings.json", async () => {
    // pre-existing default profile settings
    const claudeDir = join(fakeHome, ".claude");
    await mkdir(claudeDir, { recursive: true });
    const defaultSettings = { hooks: { PreToolUse: [{ matcher: "user-custom", hooks: ["echo x"] }] } };
    const defaultPath = join(claudeDir, "settings.json");
    await writeFile(defaultPath, JSON.stringify(defaultSettings, null, 2));
    const beforeHash = await Bun.file(defaultPath).text();

    const proc = runScript(INSTALL, env);
    expect(proc.exitCode).toBe(0);

    const afterHash = await Bun.file(defaultPath).text();
    expect(afterHash).toBe(beforeHash);
    // and no skill symlink in default profile
    expect(existsSync(join(claudeDir, "skills", "CFGM-OS"))).toBe(false);
  });

  test("T3: launcher is created and executable", async () => {
    const proc = runScript(INSTALL, env);
    expect(proc.exitCode).toBe(0);
    const launcher = join(brainHome, "bin", "claude-pai");
    expect(existsSync(launcher)).toBe(true);
    const st = await stat(launcher);
    // owner-execute bit
    expect(st.mode & 0o100).toBe(0o100);
    const content = await readFile(launcher, "utf-8");
    expect(content).toContain("CLAUDE_CONFIG_DIR");
    expect(content).toContain(brainHome);
    expect(content).toContain("exec claude");
  });

  test("T4: ~/.local/bin symlink points at launcher", async () => {
    const proc = runScript(INSTALL, env);
    expect(proc.exitCode).toBe(0);
    const link = join(fakeHome, ".local", "bin", "claude-pai");
    const st = await lstat(link);
    expect(st.isSymbolicLink()).toBe(true);
    const target = await readlink(link);
    expect(target).toBe(join(brainHome, "bin", "claude-pai"));
  });

  test("T5: idempotent — double install, marker count ≤ 6", async () => {
    runScript(INSTALL, env);
    runScript(INSTALL, env);
    const settings = await readSettings(brainHome);
    const s = JSON.stringify(settings.hooks);
    const count = (s.match(new RegExp(MARKER, "g")) || []).length;
    expect(count).toBeLessThanOrEqual(6);
  });

  test("T6: uninstall removes hooks/skill/launcher but preserves memory-brain/", async () => {
    runScript(INSTALL, env);
    // seed some data in memory-brain
    await writeFile(join(brainHome, "memory-brain", "marker.txt"), "keep-me");

    const proc = runScript(UNINSTALL, env);
    expect(proc.exitCode).toBe(0);

    const settings = await readSettings(brainHome);
    // settings.json may be removed entirely (no hooks left) OR marker absent
    if (settings !== null) {
      expect(JSON.stringify(settings.hooks || {})).not.toContain(MARKER);
    }
    expect(existsSync(join(brainHome, "skills", "CFGM-OS"))).toBe(false);
    expect(existsSync(join(brainHome, "bin", "claude-pai"))).toBe(false);
    expect(existsSync(join(fakeHome, ".local", "bin", "claude-pai"))).toBe(false);
    // memory-brain preserved
    expect(existsSync(join(brainHome, "memory-brain", "marker.txt"))).toBe(true);
  });

  test("T7: --purge removes entire ~/.claude-brain", async () => {
    runScript(INSTALL, env);
    await writeFile(join(brainHome, "memory-brain", "marker.txt"), "will-be-gone");

    const proc = runScript(UNINSTALL, env, ["--purge"]);
    expect(proc.exitCode).toBe(0);
    expect(existsSync(brainHome)).toBe(false);
    expect(existsSync(join(fakeHome, ".local", "bin", "claude-pai"))).toBe(false);
  });

  test("T8: uninstall on clean state is safe (even with --purge)", async () => {
    const p1 = runScript(UNINSTALL, env);
    expect(p1.exitCode).toBe(0);
    const p2 = runScript(UNINSTALL, env, ["--purge"]);
    expect(p2.exitCode).toBe(0);
  });

  test("T10: CLAUDE.md managed block created once, idempotent on double install", async () => {
    runScript(INSTALL, env);
    runScript(INSTALL, env);
    const claudeMd = await readFile(join(brainHome, "CLAUDE.md"), "utf-8");
    const beginCount = (claudeMd.match(/<!-- PAI-MEMORY:BEGIN managed -->/g) || []).length;
    const endCount = (claudeMd.match(/<!-- PAI-MEMORY:END -->/g) || []).length;
    expect(beginCount).toBe(1);
    expect(endCount).toBe(1);
    expect(claudeMd).toContain("@memory-brain/identity/telos.md");
    expect(claudeMd).toContain("@memory-brain/identity/goals/_index.md");
  });

  test("T11: CLAUDE.md free section outside managed block is preserved", async () => {
    runScript(INSTALL, env);
    const claudePath = join(brainHome, "CLAUDE.md");
    const before = await readFile(claudePath, "utf-8");
    const freeText = "\n\n# My personal notes\n\nThis is free content that pai-memory must not touch.\n";
    await writeFile(claudePath, before + freeText);

    runScript(INSTALL, env);
    const after = await readFile(claudePath, "utf-8");
    expect(after).toContain("# My personal notes");
    expect(after).toContain("This is free content that pai-memory must not touch.");
    // managed block still exactly 1 pair
    expect((after.match(/<!-- PAI-MEMORY:BEGIN managed -->/g) || []).length).toBe(1);
  });

  test("T12: identity files are non-destructive on reinstall", async () => {
    runScript(INSTALL, env);
    const telosPath = join(brainHome, "memory-brain", "identity", "telos.md");
    const userEdit = "# TELOS\n\n나는 소프트웨어로 세상을 바꾼다.\n";
    await writeFile(telosPath, userEdit);

    runScript(INSTALL, env);
    const after = await readFile(telosPath, "utf-8");
    expect(after).toBe(userEdit);
  });

  test("T13: uninstall removes managed block, preserves free section and identity", async () => {
    runScript(INSTALL, env);
    const claudePath = join(brainHome, "CLAUDE.md");
    const freeText = "# My personal notes\n\nDo not touch.\n";
    const before = await readFile(claudePath, "utf-8");
    await writeFile(claudePath, before + "\n\n" + freeText);
    const telosPath = join(brainHome, "memory-brain", "identity", "telos.md");
    expect(existsSync(telosPath)).toBe(true);

    const proc = runScript(UNINSTALL, env);
    expect(proc.exitCode).toBe(0);

    // managed block removed
    const after = await readFile(claudePath, "utf-8");
    expect(after).not.toContain("<!-- PAI-MEMORY:BEGIN managed -->");
    expect(after).not.toContain("@memory-brain/identity/telos.md");
    // free section preserved
    expect(after).toContain("# My personal notes");
    // identity files preserved (non-purge)
    expect(existsSync(telosPath)).toBe(true);
  });

  test("T14: unbalanced marker in CLAUDE.md — installer skips with warning, exit 0", async () => {
    const claudePath = join(brainHome, "CLAUDE.md");
    await mkdir(brainHome, { recursive: true });
    const broken = "# Broken\n\n<!-- PAI-MEMORY:BEGIN managed -->\nno end marker here\n";
    await writeFile(claudePath, broken);

    const proc = runScript(INSTALL, env);
    expect(proc.exitCode).toBe(0);
    const after = await readFile(claudePath, "utf-8");
    expect(after).toBe(broken);
    expect(proc.stderr.toString()).toContain("marker 불균형");
  });

  test("T15: --purge removes identity files", async () => {
    runScript(INSTALL, env);
    const telosPath = join(brainHome, "memory-brain", "identity", "telos.md");
    expect(existsSync(telosPath)).toBe(true);

    const proc = runScript(UNINSTALL, env, ["--purge"]);
    expect(proc.exitCode).toBe(0);
    expect(existsSync(brainHome)).toBe(false);
  });

  test("T18: install-progress.json tracks phases; interrupted state triggers resume log", async () => {
    runScript(INSTALL, env);
    const progressPath = join(brainHome, "install-progress.json");
    expect(existsSync(progressPath)).toBe(true);
    const p = JSON.parse(await readFile(progressPath, "utf-8"));
    expect(p.cfgmVersion).toMatch(/^\d+\.\d+\.\d+/);
    for (const ph of ["preflight", "staging", "commit", "welcome"]) {
      expect(p.phases[ph]).toBeDefined();
      expect(p.phases[ph].startedAt).toBeTruthy();
      expect(p.phases[ph].completedAt).toBeTruthy();
    }
    expect(p.completedAt).toBeTruthy();
    expect(p.currentPhase).toBeUndefined();

    // Simulate SIGKILL: staging started but never completed
    const interrupted = {
      cfgmVersion: p.cfgmVersion,
      startedAt: new Date().toISOString(),
      currentPhase: "staging",
      phases: {
        preflight: { startedAt: new Date().toISOString(), completedAt: new Date().toISOString() },
        staging: { startedAt: new Date().toISOString() },
      },
    };
    await writeFile(progressPath, JSON.stringify(interrupted, null, 2));

    const proc = runScript(INSTALL, env);
    expect(proc.exitCode).toBe(0);
    const stdout = proc.stdout.toString();
    expect(stdout).toContain("'staging' 단계에서 중단됨");
    const final = JSON.parse(await readFile(progressPath, "utf-8"));
    expect(final.completedAt).toBeTruthy();
    expect(final.phases.staging.completedAt).toBeTruthy();
  });

  test("T17: managed block contains CFGM:VERSION; version bump triggers 'upgraded' migration", async () => {
    const { mergeManagedBlock, managedBody, parseManagedVersion } = await import("../../bin/install-brain");
    runScript(INSTALL, env);
    const claudeMd = await readFile(join(brainHome, "CLAUDE.md"), "utf-8");
    expect(claudeMd).toMatch(/<!-- CFGM:VERSION [\d.]+ -->/);

    // Pure parser branch: upgrade from legacy (no version) → versioned
    const legacy = "<!-- PAI-MEMORY:BEGIN managed -->\n@memory-brain/identity/telos.md\n<!-- PAI-MEMORY:END -->\n";
    const upgraded = mergeManagedBlock(legacy, managedBody("0.2.0"));
    expect(upgraded.action).toBe("upgraded");
    expect(upgraded.fromVersion).toBeNull();
    expect(upgraded.toVersion).toBe("0.2.0");
    expect(parseManagedVersion(upgraded.result)).toBe("0.2.0");

    // Same version replay stays 'replaced' (no upgrade label)
    const sameVer = mergeManagedBlock(upgraded.result, managedBody("0.2.0"));
    expect(sameVer.action).toBe("replaced");
    expect(sameVer.fromVersion).toBe("0.2.0");
    expect(sameVer.toVersion).toBe("0.2.0");

    // Another version bump → upgraded again
    const bumped = mergeManagedBlock(upgraded.result, managedBody("0.3.0"));
    expect(bumped.action).toBe("upgraded");
    expect(bumped.fromVersion).toBe("0.2.0");
    expect(bumped.toVersion).toBe("0.3.0");
  });

  test("T16: install-manifest.json written with stable fields idempotent", async () => {
    runScript(INSTALL, env);
    const manifestPath = join(brainHome, "install-manifest.json");
    expect(existsSync(manifestPath)).toBe(true);
    const m1 = JSON.parse(await readFile(manifestPath, "utf-8"));
    expect(typeof m1.cfgmVersion).toBe("string");
    expect(m1.cfgmVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(m1.brainHome).toBe(brainHome);
    expect(Array.isArray(m1.files)).toBe(true);
    expect(m1.files.length).toBeGreaterThan(0);
    expect(Array.isArray(m1.hooksRegistered)).toBe(true);
    expect(m1.hooksRegistered).toContain("Stop");
    expect(m1.hooksRegistered).toContain("SessionStart");
    expect(typeof m1.hashChecksums).toBe("object");
    expect(m1.hashChecksums[join(brainHome, "CLAUDE.md")]).toMatch(/^[a-f0-9]{64}$/);
    expect(typeof m1.installedAt).toBe("string");

    // Second install: stable fields identical, installedAt may differ
    runScript(INSTALL, env);
    const m2 = JSON.parse(await readFile(manifestPath, "utf-8"));
    const stable1 = { ...m1 }; delete stable1.installedAt;
    const stable2 = { ...m2 }; delete stable2.installedAt;
    expect(stable2).toEqual(stable1);
  });

  test("T9: legacy and brain installs coexist (separate markers)", async () => {
    // Legacy install uses ~/.claude/settings.json
    await mkdir(join(fakeHome, ".claude"), { recursive: true });
    const legacyProc = runScript(LEGACY_INSTALL, {
      HOME: fakeHome,
      CFGM_PROJECT: fakeHome,
    });
    expect(legacyProc.exitCode).toBe(0);

    const brainProc = runScript(INSTALL, env);
    expect(brainProc.exitCode).toBe(0);

    // Legacy settings unchanged in marker
    const legacyRaw = await readFile(join(fakeHome, ".claude", "settings.json"), "utf-8");
    expect(legacyRaw).toContain(LEGACY_MARKER);
    expect(legacyRaw).not.toContain(MARKER);

    // Brain settings has its marker only
    const brainRaw = await readFile(join(brainHome, "settings.json"), "utf-8");
    expect(brainRaw).toContain(MARKER);

    // Uninstall brain must not touch legacy settings
    const uninstBrain = runScript(UNINSTALL, env);
    expect(uninstBrain.exitCode).toBe(0);
    const legacyAfter = await readFile(join(fakeHome, ".claude", "settings.json"), "utf-8");
    expect(legacyAfter).toContain(LEGACY_MARKER);
  });
});
