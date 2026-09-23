import { describe, test, expect, beforeAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// currentLang() falls back to the host's LANG/LC_ALL/LC_MESSAGES when
// CFGM_LANG isn't set — CI runners (macOS/Windows) default those to
// en_US.UTF-8, so tests asserting Korean output must blank them out here
// rather than inherit whatever locale the host happens to have.
const NO_LOCALE_ENV = { LANG: "", LC_ALL: "", LC_MESSAGES: "" };

function cfgm(args: string[], env: Record<string, string>) {
  return spawnSync("bun", ["run", "bin/cfgm-search.ts", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...NO_LOCALE_ENV, ...env },
    encoding: "utf-8",
  });
}

function rebuild(env: Record<string, string>) {
  return spawnSync("bun", ["run", "bin/cfgm-rebuild-index.ts", "--embeddings"], {
    cwd: process.cwd(),
    env: { ...process.env, ...NO_LOCALE_ENV, ...env },
    encoding: "utf-8",
  });
}

describe("cfgm-search — 온보딩용 wiki 검색", () => {
  let projectRoot: string;
  let env: Record<string, string>;

  beforeAll(async () => {
    projectRoot = mkdtempSync(join(tmpdir(), "cfgm-search-"));
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

  test("인덱스된 문서를 질의로 찾아온다", () => {
    const res = cfgm(["자몽바나나"], env);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("concept.example-topic");
  });

  test("--json 은 파싱 가능한 hits 배열을 반환한다", () => {
    const res = cfgm(["자몽바나나", "--json"], env);
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout);
    expect(Array.isArray(out.hits)).toBe(true);
    expect(out.hits[0].pageId).toBe("concept.example-topic");
  });

  test("질의 없이 실행 → exit 2 + 사용법 안내", () => {
    const res = cfgm([], env);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("사용법");
  });

  test("인덱스 미생성 프로젝트 → exit 1 + 안내", () => {
    const freshRoot = mkdtempSync(join(tmpdir(), "cfgm-search-noindex-"));
    const res = cfgm(["아무거나"], { CFGM_PROJECT_ROOT: freshRoot });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("rebuild-index");
  });
});
