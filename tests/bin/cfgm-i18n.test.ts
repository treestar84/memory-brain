import { describe, test, expect, beforeAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// currentLang() falls back to the host's LANG/LC_ALL/LC_MESSAGES when
// CFGM_LANG isn't set — CI runners (macOS/Windows) default those to
// en_US.UTF-8, so the "no CFGM_LANG → ko default" regression guard below
// must blank these out rather than inherit whatever locale the host has.
const NO_LOCALE_ENV = { LANG: "", LC_ALL: "", LC_MESSAGES: "" };

function run(script: string, args: string[], env: Record<string, string>) {
  return spawnSync("bun", ["run", `bin/${script}.ts`, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...NO_LOCALE_ENV, ...env },
    encoding: "utf-8",
  });
}

function rebuild(env: Record<string, string>) {
  return run("cfgm-rebuild-index", ["--embeddings"], env);
}

describe("cfgm CLI i18n (CFGM_LANG)", () => {
  let projectRoot: string;
  let baseEnv: Record<string, string>;

  beforeAll(async () => {
    projectRoot = mkdtempSync(join(tmpdir(), "cfgm-i18n-"));
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
    baseEnv = { CFGM_PROJECT_ROOT: projectRoot };
    const r = rebuild(baseEnv);
    expect(r.status).toBe(0);
  });

  test("CFGM_LANG=en 에서 cfgm-search 사용법 에러가 영어로 출력된다", () => {
    const res = run("cfgm-search", [], { ...baseEnv, CFGM_LANG: "en" });
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("Usage: cfgm search");
    expect(res.stderr).not.toContain("사용법");
  });

  test("CFGM_LANG=en 에서 cfgm-ask 가 영어 인용 instruction 을 포함한다", () => {
    const res = run("cfgm-ask", ["자몽바나나"], { ...baseEnv, CFGM_LANG: "en" });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain(
      "Answer using only the grounds above. Cite (source: <pageId> / <claim-id>) after each statement. If the grounds are insufficient, reply 'no grounds in memory' — do not guess.",
    );
  });

  test("CFGM_LANG 미설정 시 기존 한국어 문구가 그대로 출력된다 (회귀 가드)", () => {
    const searchRes = run("cfgm-search", [], baseEnv);
    expect(searchRes.status).toBe(2);
    expect(searchRes.stderr).toContain('사용법: cfgm search "<질의>" [--limit N] [--json]');

    const askRes = run("cfgm-ask", ["자몽바나나"], baseEnv);
    expect(askRes.status).toBe(0);
    expect(askRes.stdout).toContain(
      "위 근거만 사용해 질문에 답하라. 각 주장 끝에 (근거: <pageId> / <claim-id>) 형식의 pointer 를 인용하라. " +
        "위 근거로 답할 수 없으면 추측하지 말고 '메모리에 근거 없음' 이라고 답하라. 질문: 자몽바나나",
    );
  });

  test("CFGM_LANG=en 에서 cfgm-stats 요약이 영어로 출력된다", () => {
    run("cfgm-search", ["자몽바나나"], baseEnv);
    const res = run("cfgm-stats", [], { ...baseEnv, CFGM_LANG: "en" });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("cfgm usage stats — last 7 day(s)");
    expect(res.stdout).toMatch(/Searches: \d+/);
    expect(res.stdout).not.toContain("검색(search)");
  });

  test("cfgm-stats --json 필드명은 언어와 무관하게 불변이다", () => {
    const res = run("cfgm-stats", ["--json"], { ...baseEnv, CFGM_LANG: "en" });
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout);
    expect(typeof out.totalSearches).toBe("number");
    expect(typeof out.totalAsks).toBe("number");
  });
});
