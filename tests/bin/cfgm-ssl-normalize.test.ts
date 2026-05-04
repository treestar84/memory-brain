import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const SAMPLE_SKILL = `---
name: example-skill
description: Sample skill. Use when the user runs CLI tests.
---
## Acquire
Read the test file.
## Verify
Run Bash to assert.
`;

function cli(projectDir: string, args: string[]) {
  return spawnSync("bun", ["run", "bin/cfgm-ssl-normalize.ts", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, CFGM_PROJECT_ROOT: projectDir },
    encoding: "utf-8",
  });
}

describe("cfgm-ssl-normalize CLI (PR-V3.12)", () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "ssl-norm-cli-"));
    await mkdir(join(projectDir, ".claude/skills/example-skill"), { recursive: true });
    await writeFile(join(projectDir, ".claude/skills/example-skill/SKILL.md"), SAMPLE_SKILL);
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  test("default invocation → generates SSL JSON in memory/concepts/_ssl/", async () => {
    const res = cli(projectDir, ["--json"]);
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout);
    expect(out.scanned).toBe(1);
    expect(out.generated).toBe(1);
    const outFile = Bun.file(join(projectDir, "memory/concepts/_ssl/example-skill.json"));
    expect(await outFile.exists()).toBe(true);
    const doc = await outFile.json() as { scheduling: { skillName: string }; sourceSha256: string };
    expect(doc.scheduling.skillName).toBe("example-skill");
    expect(doc.sourceSha256.length).toBe(64);
  });

  test("second run unchanged → skipped (SHA256 identical)", async () => {
    cli(projectDir, ["--json"]);
    const res = cli(projectDir, ["--json"]);
    const out = JSON.parse(res.stdout);
    expect(out.skipped).toBe(1);
    expect(out.generated).toBe(0);
  });

  test("--force regenerates even when SHA matches", async () => {
    cli(projectDir, ["--json"]);
    const res = cli(projectDir, ["--json", "--force"]);
    const out = JSON.parse(res.stdout);
    expect(out.generated).toBe(1);
    expect(out.skipped).toBe(0);
  });

  test("source change → regenerated", async () => {
    cli(projectDir, ["--json"]);
    await writeFile(
      join(projectDir, ".claude/skills/example-skill/SKILL.md"),
      SAMPLE_SKILL + "\n## Act\nEdit something.\n",
    );
    const res = cli(projectDir, ["--json"]);
    const out = JSON.parse(res.stdout);
    expect(out.generated).toBe(1);
    expect(out.skipped).toBe(0);
  });
});
