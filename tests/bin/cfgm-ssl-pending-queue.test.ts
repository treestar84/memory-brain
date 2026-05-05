import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const SAMPLE_SKILL = `---
name: example-pending
description: Example. Use when user runs queue tests.
---
## Acquire
Use Bash to fetch.
## Verify
Run Bash to assert.
`;

function cli(script: string, projectDir: string, args: string[] = []) {
  return spawnSync("bun", ["run", `bin/${script}.ts`, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, CFGM_PROJECT_ROOT: projectDir },
    encoding: "utf-8",
  });
}

describe("cfgm-ssl-enqueue / validate / status (PR-V3.13-rev2 file-based queue)", () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "ssl-queue-"));
    await mkdir(join(projectDir, ".claude/skills/example-pending"), { recursive: true });
    await writeFile(join(projectDir, ".claude/skills/example-pending/SKILL.md"), SAMPLE_SKILL);
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  test("enqueue: skill with warnings → job file created (status: pending)", async () => {
    const res = cli("cfgm-ssl-enqueue", projectDir, ["--json"]);
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout);
    expect(out.scanned).toBe(1);
    expect(out.enqueued).toBe(1);

    const jobPath = join(projectDir, "memory/_pending/normalize/jobs/example-pending.job.md");
    const jobText = await readFile(jobPath, "utf-8");
    expect(jobText).toContain("status: pending");
    expect(jobText).toContain("source_path:");
    expect(jobText).toContain("output_path:");
    expect(jobText).toContain("source_sha256:");
    expect(jobText).toContain("## Source");
    expect(jobText).toContain("## Heuristic 1차 결과");
  });

  test("enqueue: re-run with unchanged SHA → skipped", async () => {
    cli("cfgm-ssl-enqueue", projectDir, ["--json"]);
    const res = cli("cfgm-ssl-enqueue", projectDir, ["--json"]);
    const out = JSON.parse(res.stdout);
    expect(out.skippedUnchanged).toBeGreaterThanOrEqual(1);
    expect(out.enqueued).toBe(0);
  });

  test("enqueue: --force re-creates job even when SHA matches", async () => {
    cli("cfgm-ssl-enqueue", projectDir, ["--json"]);
    const res = cli("cfgm-ssl-enqueue", projectDir, ["--json", "--force"]);
    const out = JSON.parse(res.stdout);
    expect(out.enqueued).toBe(1);
    expect(out.skippedUnchanged).toBe(0);
  });

  test("status: counts reflect job file state", async () => {
    cli("cfgm-ssl-enqueue", projectDir, ["--json"]);
    const res = cli("cfgm-ssl-status", projectDir, ["--json"]);
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout);
    expect(out.counts.pending).toBe(1);
    expect(out.counts.done).toBe(0);
  });

  test("validate: valid SSL JSON → exit 0", async () => {
    // First enqueue + grab heuristic doc from job file
    cli("cfgm-ssl-enqueue", projectDir, ["--json"]);
    const jobPath = join(projectDir, "memory/_pending/normalize/jobs/example-pending.job.md");
    const jobText = await readFile(jobPath, "utf-8");

    // Extract the heuristic JSON from the job file
    const m = jobText.match(/```json\n([\s\S]+?)\n```/);
    expect(m).not.toBeNull();
    const heuristicDoc = JSON.parse(m![1]);
    // The heuristic doc has warnings, so validate would fail on warnings.
    // For this test, we strip warnings to simulate a "host LLM completed" output.
    heuristicDoc.warnings = [];

    const outDir = join(projectDir, "memory/concepts/_ssl");
    await mkdir(outDir, { recursive: true });
    const outPath = join(outDir, "example-pending.json");
    await writeFile(outPath, JSON.stringify(heuristicDoc, null, 2));

    const res = cli("cfgm-ssl-validate", projectDir, [outPath]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("valid");
  });

  test("validate: schema-broken JSON → exit 1 with reason", async () => {
    const outPath = join(projectDir, "broken.json");
    await writeFile(outPath, JSON.stringify({ sslVersion: "0.0.0", structural: [], logical: [] }));
    const res = cli("cfgm-ssl-validate", projectDir, [outPath]);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/sslVersion/);
  });

  test("validate: file not found → exit 2", () => {
    const res = cli("cfgm-ssl-validate", projectDir, [join(projectDir, "nope.json")]);
    expect(res.status).toBe(2);
  });

  test("validate: unresolved warnings → exit 1", async () => {
    cli("cfgm-ssl-enqueue", projectDir, ["--json"]);
    const jobPath = join(projectDir, "memory/_pending/normalize/jobs/example-pending.job.md");
    const jobText = await readFile(jobPath, "utf-8");
    const m = jobText.match(/```json\n([\s\S]+?)\n```/);
    const docWithWarnings = JSON.parse(m![1]);
    expect(docWithWarnings.warnings.length).toBeGreaterThan(0);

    const outDir = join(projectDir, "memory/concepts/_ssl");
    await mkdir(outDir, { recursive: true });
    const outPath = join(outDir, "example-pending.json");
    await writeFile(outPath, JSON.stringify(docWithWarnings, null, 2));

    const res = cli("cfgm-ssl-validate", projectDir, [outPath]);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/unresolved warnings/);
  });

  test("enqueue: --skill <path> single-file mode", async () => {
    const skillPath = join(projectDir, ".claude/skills/example-pending/SKILL.md");
    const res = cli("cfgm-ssl-enqueue", projectDir, ["--json", "--skill", skillPath]);
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout);
    expect(out.scanned).toBe(1);
  });
});
