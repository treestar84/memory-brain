import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CLI_ENV = (projectDir: string) => ({ ...process.env, CFGM_PROJECT: projectDir });

describe("bin/cfgm-list-gaps", () => {
  let projectDir: string;
  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "cfgm-gaps-"));
  });
  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  test("빈 current-gaps.json → 빈 배열", () => {
    const result = spawnSync("bun", ["run", "bin/cfgm-list-gaps.ts", "--json"], {
      cwd: process.cwd(),
      env: CLI_ENV(projectDir),
      encoding: "utf-8",
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([]);
  });

  test("current-gaps.json 있으면 반영", async () => {
    const dir = join(projectDir, ".memory-brain", "state");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "current-gaps.json"),
      JSON.stringify({
        generatedAt: "2026-04-18T10:00:00Z",
        generatorVersion: "x",
        gaps: [
          {
            gapBlockId: "gap:semantic:s",
            problemId: "p",
            detectorId: "semantic",
            subjectBlockId: "s",
            severity: 0.5,
            voi: 0.3,
            hasQuestion: false,
            questionBlockId: null,
          },
        ],
      }),
    );
    const result = spawnSync("bun", ["run", "bin/cfgm-list-gaps.ts", "--json"], {
      cwd: process.cwd(),
      env: CLI_ENV(projectDir),
      encoding: "utf-8",
    });
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].gapBlockId).toBe("gap:semantic:s");
  });

  test("--problem 필터로 문제별 선택", async () => {
    const dir = join(projectDir, ".memory-brain", "state");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "current-gaps.json"),
      JSON.stringify({
        generatedAt: "2026-04-18T10:00:00Z",
        generatorVersion: "x",
        gaps: [
          {
            gapBlockId: "g1",
            problemId: "p1",
            detectorId: "semantic",
            subjectBlockId: "s1",
            severity: 0.5,
            voi: 0.3,
            hasQuestion: false,
            questionBlockId: null,
          },
          {
            gapBlockId: "g2",
            problemId: "p2",
            detectorId: "semantic",
            subjectBlockId: "s2",
            severity: 0.5,
            voi: 0.4,
            hasQuestion: true,
            questionBlockId: "q2",
          },
        ],
      }),
    );
    const result = spawnSync(
      "bun",
      ["run", "bin/cfgm-list-gaps.ts", "--json", "--problem", "p2"],
      { cwd: process.cwd(), env: CLI_ENV(projectDir), encoding: "utf-8" },
    );
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].gapBlockId).toBe("g2");
  });

  test("기본 텍스트 포맷은 한 줄 요약", async () => {
    const dir = join(projectDir, ".memory-brain", "state");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "current-gaps.json"),
      JSON.stringify({
        generatedAt: "2026-04-18T10:00:00Z",
        generatorVersion: "x",
        gaps: [
          {
            gapBlockId: "gap:semantic:s",
            problemId: "p",
            detectorId: "semantic",
            subjectBlockId: "s",
            severity: 0.5,
            voi: 0.3,
            hasQuestion: false,
            questionBlockId: null,
          },
        ],
      }),
    );
    const result = spawnSync("bun", ["run", "bin/cfgm-list-gaps.ts"], {
      cwd: process.cwd(),
      env: CLI_ENV(projectDir),
      encoding: "utf-8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("gap:semantic:s");
    expect(result.stdout).toContain("voi=0.30");
    expect(result.stdout).toContain("hasQ=false");
  });
});
