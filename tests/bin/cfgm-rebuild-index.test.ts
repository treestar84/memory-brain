import { describe, test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function rebuild(args: string[], projectRoot: string) {
  return spawnSync("bun", ["run", "bin/cfgm-rebuild-index.ts", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, CFGM_PROJECT_ROOT: projectRoot },
    encoding: "utf-8",
  });
}

/**
 * V3.43: 기본값이 하이브리드(FTS+벡터)로 바뀌었다(이전엔 --embeddings 로 opt-in).
 * 블라인드 인수인계 시뮬레이션에서 도메인 어휘를 모르는 자연어 질의가 FTS-only
 * 인덱스에선 0건이었는데 하이브리드에선 벡터 rescue 로 찾아진 것을 근거로 삼았다.
 */
describe("cfgm-rebuild-index — 기본 하이브리드 (V3.43)", () => {
  async function seedProject(): Promise<string> {
    const projectRoot = mkdtempSync(join(tmpdir(), "cfgm-rebuild-index-"));
    const memoryDir = join(projectRoot, "memory", "concepts");
    await mkdir(memoryDir, { recursive: true });
    await writeFile(
      join(memoryDir, "example.md"),
      [
        "---",
        "id: concept.example-topic",
        "type: concept",
        "status: active",
        "updated_at: 2026-07-28",
        "---",
        "",
        "# 예시 개념",
        "",
        "고유 키워드 자몽바나나 를 포함한 문서.",
        "",
      ].join("\n"),
    );
    return projectRoot;
  }

  test("인자 없이 실행 → 기본값이 하이브리드(embeddings: on)", async () => {
    const projectRoot = await seedProject();
    const res = rebuild([], projectRoot);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("embeddings: on (hybrid search enabled)");
  });

  test("--no-embeddings → lexical-only(embeddings: off)", async () => {
    const projectRoot = await seedProject();
    const res = rebuild(["--no-embeddings"], projectRoot);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("embeddings: off");
  });

  test("--embeddings 는 하위호환 no-op 로 여전히 하이브리드를 켠다", async () => {
    const projectRoot = await seedProject();
    const res = rebuild(["--embeddings"], projectRoot);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("embeddings: on (hybrid search enabled)");
  });
});
