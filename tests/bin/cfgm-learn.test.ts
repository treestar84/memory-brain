import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function cli(projectDir: string, args: string[], opts: { input?: string } = {}) {
  return spawnSync("bun", ["run", "bin/cfgm-learn.ts", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, CFGM_PROJECT_ROOT: projectDir },
    encoding: "utf-8",
    input: opts.input,
  });
}

describe("cfgm-learn CLI", () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "cfgm-learn-"));
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  test("missing --name → exit(1)", () => {
    const res = cli(projectDir, ["--goal", "do something"]);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("--name");
  });

  test("missing --goal → exit(1)", () => {
    const res = cli(projectDir, ["--name", "my-flow"]);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("--goal");
  });

  test("basic run creates memory/workflows/<slug>.md", async () => {
    const res = cli(projectDir, ["--name", "my-flow", "--goal", "test goal"]);
    expect(res.status).toBe(0);
    const skillFile = Bun.file(join(projectDir, "memory/workflows/my-flow.md"));
    expect(await skillFile.exists()).toBe(true);
    const content = await skillFile.text();
    expect(content).toContain("name: my-flow");
    expect(content).toContain("test goal");
    expect(content).toContain("## Acquire");
    expect(content).toContain("## Verify");
  });

  test("--json output is parseable and contains name/skillPath", () => {
    const res = cli(projectDir, ["--name", "json-flow", "--goal", "json test", "--json"]);
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout);
    expect(out.name).toBe("json-flow");
    expect(out.skillPath).toContain("json-flow.md");
    expect(typeof out.sslResult).toBe("string");
    expect(typeof out.warnings).toBe("number");
  });

  test("ssl result is direct or enqueued", () => {
    const res = cli(projectDir, ["--name", "ssl-flow", "--goal", "ssl test", "--json"]);
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout);
    expect(["direct", "enqueued"]).toContain(out.sslResult);
  });

  test("no --force, same name twice → second run exits 1", async () => {
    const first = cli(projectDir, ["--name", "dup-flow", "--goal", "first run"]);
    expect(first.status).toBe(0);
    const second = cli(projectDir, ["--name", "dup-flow", "--goal", "second run"]);
    expect(second.status).toBe(1);
    expect(second.stderr).toContain("already exists");
  });

  test("--force allows overwriting existing workflow", async () => {
    const first = cli(projectDir, ["--name", "force-flow", "--goal", "first goal", "--json"]);
    expect(first.status).toBe(0);
    const second = cli(projectDir, ["--name", "force-flow", "--goal", "updated goal", "--force", "--json"]);
    expect(second.status).toBe(0);
    const skillFile = Bun.file(join(projectDir, "memory/workflows/force-flow.md"));
    const content = await skillFile.text();
    expect(content).toContain("updated goal");
  });

  test("--steps-file reads steps from file", async () => {
    const stepsFile = join(projectDir, "steps.md");
    await writeFile(stepsFile, "Step 1: do this\nStep 2: do that\n");
    const res = cli(projectDir, [
      "--name", "steps-flow",
      "--goal", "steps test",
      "--steps-file", stepsFile,
      "--json",
    ]);
    expect(res.status).toBe(0);
    const skillFile = Bun.file(join(projectDir, "memory/workflows/steps-flow.md"));
    const content = await skillFile.text();
    expect(content).toContain("Step 1: do this");
  });

  test("name with special chars is slugified", () => {
    const res = cli(projectDir, ["--name", "My Flow! 테스트", "--goal", "slug test", "--json"]);
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout);
    expect(out.name).toMatch(/^[a-z0-9_-]+$/);
  });

  test("steps 에 시크릿이 있으면 memory/workflows/*.md 에 저장되기 전에 마스킹된다 (V3.43)", async () => {
    const stepsFile = join(projectDir, "steps.md");
    await writeFile(stepsFile, "Step 1: export key sk-ant-1234567890abcdefghijklmnop\nStep 2: run it\n");
    const res = cli(projectDir, [
      "--name", "leaky-flow",
      "--goal", "leaky test",
      "--steps-file", stepsFile,
      "--json",
    ]);
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout);
    expect(out.redacted).toBe(true);

    const content = await Bun.file(join(projectDir, "memory/workflows/leaky-flow.md")).text();
    expect(content).not.toContain("sk-ant-1234567890abcdefghijklmnop");
    expect(content).toContain("<REDACTED:anthropic-key>");

    const log = JSON.parse(await Bun.file(join(projectDir, ".memory-brain/security/redacted.jsonl")).text());
    expect(log.patternName).toBe("anthropic-key");
  });

  test("시크릿 없는 steps → redacted: false", () => {
    const res = cli(projectDir, ["--name", "clean-flow", "--goal", "clean test", "--json"], {
      input: "Step 1: do something ordinary\n",
    });
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout);
    expect(out.redacted).toBe(false);
  });
});
