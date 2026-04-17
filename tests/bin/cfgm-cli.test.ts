import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("cfgm CLI tools", () => {
  let tmpDir: string;
  let projectMb: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "cfgm-cli-"));
    projectMb = join(tmpDir, ".memory-brain");
    await mkdir(join(projectMb, "state"), { recursive: true });
    await mkdir(join(projectMb, "ledger"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  const run = (script: string, args: string[] = []) =>
    Bun.spawnSync({
      cmd: ["bun", "run", join(import.meta.dir, "../../bin", script), ...args],
      env: { ...process.env, CFGM_PROJECT_ROOT: tmpDir },
    });

  test("cfgm-new-problem creates a problem", () => {
    const result = run("cfgm-new-problem.ts", ["Fix auth", "fix-auth"]);
    expect(result.exitCode).toBe(0);
    const out = result.stdout.toString();
    expect(out).toContain("fix-auth");
  });

  test("cfgm-switch list shows problems", () => {
    run("cfgm-new-problem.ts", ["Problem A", "prob-a"]);
    run("cfgm-new-problem.ts", ["Problem B", "prob-b"]);
    const result = run("cfgm-switch.ts", ["list"]);
    expect(result.stdout.toString()).toContain("prob-a");
    expect(result.stdout.toString()).toContain("prob-b");
  });

  test("cfgm-process list shows empty queue", () => {
    const result = run("cfgm-process.ts", ["list"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("0");
  });

  test("cfgm-requeue list shows empty", () => {
    const result = run("cfgm-requeue.ts", ["list"]);
    expect(result.exitCode).toBe(0);
  });
});
