import { describe, test, expect, beforeAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function cfgm(args: string[], env: Record<string, string>) {
  return spawnSync("bun", ["run", "bin/cfgm-ask.ts", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: "utf-8",
  });
}

function rebuild(env: Record<string, string>) {
  return spawnSync("bun", ["run", "bin/cfgm-rebuild-index.ts", "--embeddings"], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: "utf-8",
  });
}

describe("cfgm-ask — evidence pointer 근거 번들 컴포저", () => {
  let projectRoot: string;
  let env: Record<string, string>;

  beforeAll(async () => {
    projectRoot = mkdtempSync(join(tmpdir(), "cfgm-ask-"));
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
        "<!-- claim:cl-ex-002 -->",
        "두 번째 진술.",
        "",
      ].join("\n"),
    );
    env = { CFGM_PROJECT_ROOT: projectRoot };
    const r = rebuild(env);
    expect(r.status).toBe(0);
  });

  test("인덱스된 문서를 질의로 찾고 claim id 가 출력에 포함된다", () => {
    const res = cfgm(["자몽바나나"], env);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("concept.example-topic");
    expect(res.stdout).toContain("cl-ex-001");
    expect(res.stdout).toContain("cl-ex-002");
  });

  test("--json 은 grounds[0].claimIds 배열을 올바르게 반환한다", () => {
    const res = cfgm(["자몽바나나", "--json"], env);
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout);
    expect(Array.isArray(out.grounds)).toBe(true);
    expect(out.grounds[0].pageId).toBe("concept.example-topic");
    expect(out.grounds[0].claimIds).toEqual(["cl-ex-001", "cl-ex-002"]);
    expect(typeof out.instruction).toBe("string");
  });

  test("텍스트 출력에 인용 지시 푸터가 포함된다", () => {
    const res = cfgm(["자몽바나나"], env);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("근거:");
    expect(res.stdout).toContain("메모리에 근거 없음");
  });

  test("텍스트 출력에 토큰 추정 푸터가 표시된다", () => {
    const res = cfgm(["자몽바나나"], env);
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/근거 번들 ~\d+ tokens · 전체 메모리 ~\d+ tokens 의 [\d.]+% \(추정: chars\/4\)/);
  });

  test("--json 은 tokens.bundle/corpus/pct 를 포함한다", () => {
    const res = cfgm(["자몽바나나", "--json"], env);
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout);
    expect(typeof out.tokens.bundle).toBe("number");
    expect(typeof out.tokens.corpus).toBe("number");
    expect(out.tokens.corpus).toBeGreaterThan(0);
    expect(typeof out.tokens.pct).toBe("number");
  });

  test("질의 없이 실행 → exit 2 + 사용법 안내", () => {
    const res = cfgm([], env);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("사용법");
  });

  test("인덱스 미생성 프로젝트 → exit 1 + 안내", () => {
    const freshRoot = mkdtempSync(join(tmpdir(), "cfgm-ask-noindex-"));
    const res = cfgm(["아무거나"], { CFGM_PROJECT_ROOT: freshRoot });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("rebuild-index");
  });
});
