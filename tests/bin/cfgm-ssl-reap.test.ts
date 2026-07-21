import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function cli(script: string, projectDir: string, args: string[] = []) {
  return spawnSync("bun", ["run", `bin/${script}.ts`, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, CFGM_PROJECT_ROOT: projectDir },
    encoding: "utf-8",
  });
}

function job(fm: Record<string, unknown>): string {
  const lines = Object.entries(fm).map(([k, v]) => `${k}: ${v}`);
  return `---\n${lines.join("\n")}\n---\n\n# job body\n`;
}

describe("cfgm-ssl-reap (V3.28 orphan 회수)", () => {
  let projectDir: string;
  let jobsDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "ssl-reap-"));
    jobsDir = join(projectDir, "memory/_pending/normalize/jobs");
    await mkdir(jobsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  test("만료 lease + attempts<max → pending 재큐", async () => {
    await writeFile(
      join(jobsDir, "orphan.job.md"),
      job({ job_id: "j1", status: "in_progress", attempts: 1, max_attempts: 3, lease_expires_at: "2020-01-01T00:00:00.000Z" }),
    );
    const res = cli("cfgm-ssl-reap", projectDir, ["--json"]);
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout);
    expect(out.requeued).toBe(1);
    const txt = await readFile(join(jobsDir, "orphan.job.md"), "utf-8");
    expect(txt).toContain("status: pending");
    expect(txt).not.toContain("lease_expires_at");
  });

  test("만료 lease + attempts 한도 도달 → failed", async () => {
    await writeFile(
      join(jobsDir, "dead.job.md"),
      job({ job_id: "j2", status: "in_progress", attempts: 3, max_attempts: 3, lease_expires_at: "2020-01-01T00:00:00.000Z" }),
    );
    const res = cli("cfgm-ssl-reap", projectDir, ["--json"]);
    const out = JSON.parse(res.stdout);
    expect(out.failed).toBe(1);
    const txt = await readFile(join(jobsDir, "dead.job.md"), "utf-8");
    expect(txt).toContain("status: failed");
    expect(txt).toContain("failure_reason");
  });

  test("--dry-run — 판정만 하고 파일 무변경", async () => {
    const original = job({ job_id: "j3", status: "in_progress", attempts: 1, max_attempts: 3, lease_expires_at: "2020-01-01T00:00:00.000Z" });
    await writeFile(join(jobsDir, "dry.job.md"), original);
    const res = cli("cfgm-ssl-reap", projectDir, ["--json", "--dry-run"]);
    const out = JSON.parse(res.stdout);
    expect(out.requeued).toBe(1);
    expect(await readFile(join(jobsDir, "dry.job.md"), "utf-8")).toBe(original);
  });

  test("유효 lease / pending / done 은 untouched", async () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    await writeFile(join(jobsDir, "live.job.md"), job({ status: "in_progress", attempts: 1, lease_expires_at: future }));
    await writeFile(join(jobsDir, "pend.job.md"), job({ status: "pending", attempts: 0 }));
    await writeFile(join(jobsDir, "done.job.md"), job({ status: "done" }));
    const out = JSON.parse(cli("cfgm-ssl-reap", projectDir, ["--json"]).stdout);
    expect(out.untouched).toBe(3);
    expect(out.requeued).toBe(0);
    expect(out.failed).toBe(0);
  });

  test("디렉토리 없음 → 정상 종료 0건", () => {
    const res = cli("cfgm-ssl-reap", join(projectDir, "nowhere"), ["--json"]);
    expect(res.status).toBe(0);
    expect(JSON.parse(res.stdout).scanned).toBe(0);
  });

  test("status CLI 가 stale 카운트를 노출", async () => {
    await writeFile(
      join(jobsDir, "orphan.job.md"),
      job({ status: "in_progress", attempts: 1, lease_expires_at: "2020-01-01T00:00:00.000Z" }),
    );
    const out = JSON.parse(cli("cfgm-ssl-status", projectDir, ["--json"]).stdout);
    expect(out.stale).toBe(1);
  });
});
