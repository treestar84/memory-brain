import { describe, test, expect, beforeAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function run(script: string, args: string[], env: Record<string, string>) {
  return spawnSync("bun", ["run", `bin/${script}.ts`, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: "utf-8",
  });
}

function rebuild(env: Record<string, string>) {
  return run("cfgm-rebuild-index", ["--embeddings"], env);
}

describe("cfgm-stats — 사용 통계 요약", () => {
  let projectRoot: string;
  let env: Record<string, string>;

  beforeAll(async () => {
    projectRoot = mkdtempSync(join(tmpdir(), "cfgm-stats-"));
    const memoryDir = join(projectRoot, "memory", "concepts");
    await mkdir(memoryDir, { recursive: true });
    await writeFile(
      join(memoryDir, "example.md"),
      [
        "---",
        "id: concept.example-topic",
        "type: concept",
        "status: active",
        "updated_at: 2026-07-23",
        "---",
        "",
        "# 예시 개념",
        "",
        "## Summary",
        "",
        "<!-- claim:cl-ex-001 -->",
        "온보딩 검증용 고유 키워드 자몽바나나 를 포함한 문서.",
        "",
      ].join("\n"),
    );
    env = { CFGM_PROJECT_ROOT: projectRoot };
    const r = rebuild(env);
    expect(r.status).toBe(0);
  });

  test("cfgm-search 실행 후 usage.jsonl 에 엔트리가 남는다", async () => {
    const res = run("cfgm-search", ["자몽바나나"], env);
    expect(res.status).toBe(0);
    const logPath = join(projectRoot, ".memory-brain", "stats", "usage.jsonl");
    const text = await Bun.file(logPath).text();
    expect(text.trim().length).toBeGreaterThan(0);
    const entry = JSON.parse(text.trim().split("\n")[0]!);
    expect(entry.tool).toBe("search");
    expect(entry.query).toBe("자몽바나나");
  });

  test("cfgm-stats 가 집계를 출력한다 (--json 파싱 검증)", () => {
    run("cfgm-ask", ["자몽바나나"], env);
    const res = run("cfgm-stats", ["--json"], env);
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout);
    expect(out.totalSearches).toBeGreaterThanOrEqual(1);
    expect(out.totalAsks).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(out.topQueries)).toBe(true);
    expect(Array.isArray(out.topPages)).toBe(true);
    expect(Array.isArray(out.byDay)).toBe(true);
  });

  test("기록 없음 → 안내 문구 + exit 0", () => {
    const freshRoot = mkdtempSync(join(tmpdir(), "cfgm-stats-empty-"));
    const res = run("cfgm-stats", [], { CFGM_PROJECT_ROOT: freshRoot });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("아직 사용 기록 없음");
  });

  test("usage.jsonl 에 손상 라인 심어도 stats 가 크래시 없이 동작", async () => {
    const logPath = join(projectRoot, ".memory-brain", "stats", "usage.jsonl");
    await appendFile(logPath, "{ 이건 유효한 json 이 아님\n");
    const res = run("cfgm-stats", ["--json"], env);
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout);
    expect(typeof out.totalSearches).toBe("number");
  });
});
