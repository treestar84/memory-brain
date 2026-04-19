import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CLI_ENV = (projectDir: string) => ({
  ...process.env,
  CFGM_PROJECT: projectDir,
  CFGM_USER_HOME: join(projectDir, "user-home"),
});

describe("bin/cfgm-ontology-record", () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "cfgm-e4-"));
  });
  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  test("--problem 없으면 exit=1", () => {
    const r = spawnSync("bun", ["run", "bin/cfgm-ontology-record.ts"], {
      cwd: process.cwd(), env: CLI_ENV(projectDir), encoding: "utf-8",
    });
    expect(r.status).not.toBe(0);
  });

  test("신규 모듈 생성 + 패턴 기록", () => {
    const r = spawnSync("bun", ["run", "bin/cfgm-ontology-record.ts", "--problem", "p1"], {
      cwd: process.cwd(), env: CLI_ENV(projectDir), encoding: "utf-8",
      input: JSON.stringify({ blockTypeCounts: { Action: 2, Outcome: 1 } }),
    });
    expect(r.status).toBe(0);
    const data = JSON.parse(r.stdout);
    expect(data.problemId).toBe("p1");
    expect(data.observedPatterns.Action).toBe(2);
  });

  test("--resolve 시 resolvedRuns 증가", () => {
    // 먼저 모듈 생성
    spawnSync("bun", ["run", "bin/cfgm-ontology-record.ts", "--problem", "p1"], {
      cwd: process.cwd(), env: CLI_ENV(projectDir), encoding: "utf-8",
      input: JSON.stringify({ blockTypeCounts: {} }),
    });
    const r = spawnSync(
      "bun",
      ["run", "bin/cfgm-ontology-record.ts", "--problem", "p1", "--resolve"],
      { cwd: process.cwd(), env: CLI_ENV(projectDir), encoding: "utf-8",
        input: JSON.stringify({ blockTypeCounts: {} }) },
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("resolvedRuns=1");
  });
});
