import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const SCRIPT = join(import.meta.dir, "../../hooks/check-deps.ts");

function run(pluginRoot: string) {
  return Bun.spawnSync({
    cmd: ["bun", "run", SCRIPT],
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot },
    stdout: "pipe",
    stderr: "pipe",
  });
}

describe("hooks/check-deps.ts", () => {
  let pluginRoot: string;

  beforeEach(async () => {
    pluginRoot = await mkdtemp(join(tmpdir(), "cfgm-check-deps-"));
  });

  afterEach(async () => {
    await rm(pluginRoot, { recursive: true, force: true });
  });

  test("silent + exit 0 when node_modules/yaml is present", async () => {
    await mkdir(join(pluginRoot, "node_modules", "yaml"), { recursive: true });
    const proc = run(pluginRoot);
    expect(proc.exitCode).toBe(0);
    expect(proc.stdout.toString().trim()).toBe("");
  });

  test("prints install reminder + still exit 0 when node_modules/yaml is missing", () => {
    const proc = run(pluginRoot);
    expect(proc.exitCode).toBe(0);
    expect(proc.stdout.toString()).toContain("Dependencies not installed yet");
    expect(proc.stdout.toString()).toContain("/memory-brain:setup");
  });
});
