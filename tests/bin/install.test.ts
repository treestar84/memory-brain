import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const MARKER = "cfgm-os";

async function readSettings(home: string) {
  const p = join(home, ".claude", "settings.json");
  try { return JSON.parse(await readFile(p, "utf-8")); }
  catch { return null; }
}

describe("install.ts", () => {
  let fakeHome: string;

  beforeEach(async () => {
    fakeHome = await mkdtemp(join(tmpdir(), "cfgm-install-"));
    await mkdir(join(fakeHome, ".claude"), { recursive: true });
  });

  afterEach(async () => {
    await rm(fakeHome, { recursive: true, force: true });
  });

  test("creates settings.json with hooks when none exists", async () => {
    const proc = Bun.spawnSync({
      cmd: ["bun", "run", join(import.meta.dir, "../../bin/install.ts")],
      env: { ...process.env, HOME: fakeHome, CFGM_PROJECT: fakeHome },
    });
    expect(proc.exitCode).toBe(0);
    const settings = await readSettings(fakeHome);
    expect(settings).not.toBeNull();
    expect(settings.hooks).toBeDefined();
    const hookStr = JSON.stringify(settings.hooks);
    expect(hookStr).toContain(MARKER);
  });

  test("preserves existing hooks on install", async () => {
    const existing = {
      hooks: {
        PreToolUse: [{ matcher: "custom", hooks: ["echo custom"] }],
      },
    };
    await writeFile(
      join(fakeHome, ".claude", "settings.json"),
      JSON.stringify(existing, null, 2)
    );
    Bun.spawnSync({
      cmd: ["bun", "run", join(import.meta.dir, "../../bin/install.ts")],
      env: { ...process.env, HOME: fakeHome, CFGM_PROJECT: fakeHome },
    });
    const settings = await readSettings(fakeHome);
    const pre = settings.hooks.PreToolUse;
    expect(pre.some((h: any) => h.matcher === "custom")).toBe(true);
    expect(pre.some((h: any) => JSON.stringify(h).includes(MARKER))).toBe(true);
  });

  test("idempotent — double install no duplicates", async () => {
    const run = () =>
      Bun.spawnSync({
        cmd: ["bun", "run", join(import.meta.dir, "../../bin/install.ts")],
        env: { ...process.env, HOME: fakeHome, CFGM_PROJECT: fakeHome },
      });
    run();
    run();
    const settings = await readSettings(fakeHome);
    const hookStr = JSON.stringify(settings.hooks);
    const count = (hookStr.match(new RegExp(MARKER, "g")) || []).length;
    expect(count).toBeLessThanOrEqual(6);
  });

  test("uninstall removes only cfgm-os hooks", async () => {
    const existing = {
      hooks: {
        PreToolUse: [{ matcher: "custom", hooks: ["echo custom"] }],
      },
    };
    await writeFile(
      join(fakeHome, ".claude", "settings.json"),
      JSON.stringify(existing, null, 2)
    );
    Bun.spawnSync({
      cmd: ["bun", "run", join(import.meta.dir, "../../bin/install.ts")],
      env: { ...process.env, HOME: fakeHome, CFGM_PROJECT: fakeHome },
    });
    Bun.spawnSync({
      cmd: ["bun", "run", join(import.meta.dir, "../../bin/uninstall.ts")],
      env: { ...process.env, HOME: fakeHome },
    });
    const settings = await readSettings(fakeHome);
    expect(JSON.stringify(settings.hooks)).not.toContain(MARKER);
    expect(settings.hooks.PreToolUse.some((h: any) => h.matcher === "custom")).toBe(true);
  });

  test("uninstall on clean state is safe", async () => {
    const proc = Bun.spawnSync({
      cmd: ["bun", "run", join(import.meta.dir, "../../bin/uninstall.ts")],
      env: { ...process.env, HOME: fakeHome },
    });
    expect(proc.exitCode).toBe(0);
  });

  test("Stop hook points to session-end.ts (not stop.ts)", async () => {
    Bun.spawnSync({
      cmd: ["bun", "run", join(import.meta.dir, "../../bin/install.ts")],
      env: { ...process.env, HOME: fakeHome, CFGM_PROJECT: fakeHome },
    });
    const settings = await readSettings(fakeHome);
    const stopStr = JSON.stringify(settings.hooks.Stop);
    expect(stopStr).toContain("session-end.ts");
    expect(stopStr).not.toContain("/stop.ts");
  });

  test("install.ts emits deprecation warning on stderr", async () => {
    const proc = Bun.spawnSync({
      cmd: ["bun", "run", join(import.meta.dir, "../../bin/install.ts")],
      env: { ...process.env, HOME: fakeHome, CFGM_PROJECT: fakeHome },
      stderr: "pipe",
    });
    expect(proc.exitCode).toBe(0);
    const stderr = new TextDecoder().decode(proc.stderr);
    expect(stderr).toContain("deprecated");
    expect(stderr).toContain("install-brain.ts");
  });
});
