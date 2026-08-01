import { describe, test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SearchIndex } from "../../src/core/search/SearchIndex";
import { HashedNgramEmbedder } from "../../src/core/search/Embedder";

function cfgm(args: string[], env: Record<string, string> = {}) {
  return spawnSync("bun", ["run", "bin/cfgm.ts", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: "utf-8",
  });
}

describe("cfgm 통합 CLI (V3.31)", () => {
  test("help — 그룹별 명령 목록 출력, exit 0", () => {
    const res = cfgm(["help"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("시작하기");
    expect(res.stdout).toContain("doctor");
    expect(res.stdout).toContain("bench-lme");
    expect(res.stdout).toContain("ssl-status");
  });

  test("인자 없이 실행 → help 와 동일", () => {
    const res = cfgm([]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("통합 CLI");
  });

  test("registry 명령 dispatch — ssl-status 가 인자와 함께 실행됨", () => {
    const emptyProject = mkdtempSync(join(tmpdir(), "cfgm-dispatch-"));
    const res = cfgm(["ssl-status", "--json"], { CFGM_PROJECT_ROOT: emptyProject });
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout);
    expect(out).toHaveProperty("counts");
  });

  test("미등록 명령 — bin/cfgm-<name>.ts 존재 시 실행 (registry 누락 무해)", () => {
    // ssl-stats 는 registry 에 있지만, 미등록 시나리오 검증용으로 registry 에 없는
    // 스크립트 하나를 직접 지정: cfgm-validate 는 registry 미등록
    const res = cfgm(["validate", "--help"]);
    // 실행 자체가 되면 성공 (스크립트가 --help 를 모르면 비정상 종료할 수 있으나 dispatch 는 성립)
    expect(res.stderr).not.toContain("알 수 없는 명령");
  });

  test("알 수 없는 명령 → exit 2 + 안내", () => {
    const res = cfgm(["definitely-not-a-command"]);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("알 수 없는 명령");
    expect(res.stderr).toContain("cfgm help");
  });

  test("doctor — 필수 점검 실행, repo 루트에서 exit 0/1", () => {
    const res = cfgm(["doctor"]);
    expect([0, 1]).toContain(res.status ?? -1);
    expect(res.stdout).toContain("자가진단");
    expect(res.stdout).toContain("Bun ≥ 1.1");
    expect(res.stdout).toContain("SSL 큐");
  });

  test("doctor — vector dims mismatch 는 감지·안내하고, 일치 시엔 통과로 보고", () => {
    const project = mkdtempSync(join(tmpdir(), "cfgm-dims-"));
    mkdirSync(join(project, "memory"), { recursive: true });
    mkdirSync(join(project, ".memory-brain", "indexes"), { recursive: true });
    const indexPath = join(project, ".memory-brain", "indexes", "search.sqlite");

    // 현재 기본 dims(256)와 다른 512 로 인덱스를 만들어 불일치를 재현
    const idx = new SearchIndex(indexPath);
    idx.rebuild({ wikiPages: [], claims: [], embedder: new HashedNgramEmbedder({ dims: 512 }) });
    idx.close();

    const res = cfgm(["doctor"], { CFGM_PROJECT_ROOT: project });
    expect(res.stdout).toContain("벡터 차원 정합성");
    expect(res.stdout).toContain("dims=512");
    expect(res.stdout).toContain("dims=256");
    expect(res.stdout).toContain("불일치");
    expect(res.stdout).toContain("cfgm rebuild-index --embeddings");

    // 같은 dims 로 재구축하면 일치로 보고
    const idx2 = new SearchIndex(indexPath);
    idx2.rebuild({ wikiPages: [], claims: [], embedder: new HashedNgramEmbedder({ dims: 256 }) });
    idx2.close();
    const res2 = cfgm(["doctor"], { CFGM_PROJECT_ROOT: project });
    expect(res2.stdout).toContain("dims=256 일치");
    expect(res2.stdout).not.toContain("불일치");
  });
});
