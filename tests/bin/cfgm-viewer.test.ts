import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

/**
 * cfgm-viewer 대시보드 확장 (V3.43) — 위키 페이지 목록/검색/인덱스 상태/capture 큐
 * 를 보여주는 API. 기존 Flow Graph Viewer 는 건드리지 않고 라우트만 추가했다.
 */
describe("cfgm-viewer — dashboard API", () => {
  let projectRoot: string;
  let port: number;
  let proc: ReturnType<typeof Bun.spawn>;
  const base = () => `http://localhost:${port}`;

  beforeAll(async () => {
    projectRoot = mkdtempSync(join(tmpdir(), "cfgm-viewer-"));
    const conceptsDir = join(projectRoot, "memory", "concepts");
    await mkdir(conceptsDir, { recursive: true });
    await writeFile(
      join(conceptsDir, "example.md"),
      [
        "---",
        "id: concept.example-topic",
        "type: concept",
        "status: active",
        "confidence: high",
        "updated_at: 2026-07-28",
        "---",
        "",
        "# 예시 개념",
        "",
        "온보딩 검증용 고유 키워드 자몽바나나 를 포함한 문서.",
        "",
      ].join("\n"),
    );

    const rebuild = spawnSync("bun", ["run", "bin/cfgm-rebuild-index.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, CFGM_PROJECT_ROOT: projectRoot },
      encoding: "utf-8",
    });
    expect(rebuild.status).toBe(0);

    port = 41000 + Math.floor(Math.random() * 5000);
    proc = Bun.spawn(["bun", "run", "bin/cfgm-viewer.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, CFGM_PROJECT_ROOT: projectRoot, CFGM_VIEWER_PORT: String(port) },
      stdout: "pipe",
      stderr: "pipe",
    });

    // 서버가 뜰 때까지 짧게 폴링 (최대 ~5초)
    for (let i = 0; i < 50; i++) {
      try {
        const res = await fetch(base() + "/api/wiki");
        if (res.ok) break;
      } catch { /* 아직 안 뜸 */ }
      await new Promise((r) => setTimeout(r, 100));
    }
  });

  afterAll(() => {
    proc?.kill();
  });

  test("/api/wiki — 캡처된 위키 페이지를 나열한다", async () => {
    const res = await fetch(base() + "/api/wiki");
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.count).toBe(1);
    expect(data.pages[0].id).toBe("concept.example-topic");
    expect(data.pages[0].type).toBe("concept");
  });

  test("/api/index-status — 재생성 시각/위키 카운트/벡터 차원을 보여준다", async () => {
    const res = await fetch(base() + "/api/index-status");
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.exists).toBe(true);
    expect(data.wikiCount).toBe(1);
    expect(typeof data.rebuiltAt).toBe("string");
  });

  test("/api/search — 질의로 실제 hit 을 반환한다", async () => {
    const res = await fetch(base() + "/api/search?q=" + encodeURIComponent("자몽바나나"));
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.hits.length).toBeGreaterThan(0);
    expect(data.hits[0].pageId).toBe("concept.example-topic");
  });

  test("/api/search — 빈 질의는 hits 빈 배열", async () => {
    const res = await fetch(base() + "/api/search?q=");
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.hits).toEqual([]);
  });

  test("/api/capture-status — 큐가 비어 있으면 전부 0", async () => {
    const res = await fetch(base() + "/api/capture-status");
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.counts.pending).toBe(0);
    expect(data.draftCount).toBe(0);
  });

  test("/ — 대시보드 HTML 을 반환한다", async () => {
    const res = await fetch(base() + "/");
    expect(res.ok).toBe(true);
    const html = await res.text();
    expect(html).toContain("memory-brain");
  });
});
