import { describe, test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function cfgmRotBench(args: string[], env: Record<string, string>) {
  return spawnSync("bun", ["run", "bin/cfgm-rot-bench.ts", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: "utf-8",
  });
}

describe("cfgm-rot-bench CLI", () => {
  test("데이터셋 파일이 없으면 exit 1 + 다운로드 안내", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "cfgm-rot-bench-"));
    const res = cfgmRotBench([], { CFGM_PROJECT_ROOT: projectRoot });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("dataset not found");
    expect(res.stderr).toContain("longmemeval-cleaned");
  });

  test("--sample 에 유효하지 않은 값이면 exit 1", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "cfgm-rot-bench-"));
    const res = cfgmRotBench(["--sample", "not-a-number"], { CFGM_PROJECT_ROOT: projectRoot });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("invalid --sample");
  });
});
