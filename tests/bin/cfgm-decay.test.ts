import { describe, test, expect, beforeAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";

function run(args: string[], env: Record<string, string>) {
  return spawnSync("bun", ["run", "bin/cfgm-decay.ts", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: "utf-8",
  });
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

describe("cfgm decay — wiki 망각 판정", () => {
  let projectRoot: string;
  let env: Record<string, string>;

  beforeAll(async () => {
    projectRoot = mkdtempSync(join(tmpdir(), "cfgm-decay-"));
    const conceptsDir = join(projectRoot, "memory", "concepts");
    const decisionsDir = join(projectRoot, "memory", "decisions");
    await mkdir(conceptsDir, { recursive: true });
    await mkdir(decisionsDir, { recursive: true });

    // 오래된 active page → decay-candidate (age > 90일, 회상 없음)
    await writeFile(
      join(conceptsDir, "old-active.md"),
      [
        "---",
        "id: concept.old-active",
        "type: concept",
        "status: active",
        "updated_at: " + isoDaysAgo(200),
        "---",
        "",
        "# 오래된 개념",
        "",
        "## Summary",
        "",
        "<!-- claim:cl-old-001 -->",
        "오래된 진술.",
        "",
      ].join("\n"),
    );

    // 오래된 draft page → stale-draft
    await writeFile(
      join(decisionsDir, "old-draft.md"),
      [
        "---",
        "id: decision.old-draft",
        "type: decision",
        "status: draft",
        "updated_at: " + isoDaysAgo(30),
        "---",
        "",
        "# 미완성 결정",
        "",
        "## Summary",
        "",
        "<!-- claim:cl-draft-001 -->",
        "초안 진술.",
        "",
      ].join("\n"),
    );

    // 최신 page → fresh
    await writeFile(
      join(conceptsDir, "fresh.md"),
      [
        "---",
        "id: concept.fresh",
        "type: concept",
        "status: active",
        "updated_at: " + isoDaysAgo(1),
        "---",
        "",
        "# 최신 개념",
        "",
        "## Summary",
        "",
        "<!-- claim:cl-fresh-001 -->",
        "최근 진술.",
        "",
      ].join("\n"),
    );

    env = { CFGM_PROJECT_ROOT: projectRoot };
  });

  test("dry-run — tier별 목록을 출력하고 memory/reports/decay-latest.md 를 생성한다", async () => {
    const res = run([], env);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("concept.old-active");
    expect(res.stdout).toContain("decision.old-draft");
    expect(res.stdout).toContain("decay-candidate");
    expect(res.stdout).toContain("stale-draft");

    const reportPath = join(projectRoot, "memory", "reports", "decay-latest.md");
    expect(existsSync(reportPath)).toBe(true);
    const report = await Bun.file(reportPath).text();
    expect(report).toContain("concept.old-active");
  });

  test("--json — 파싱 가능한 findings 배열을 반환한다", () => {
    const res = run(["--json"], env);
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout);
    expect(Array.isArray(out.findings)).toBe(true);
    const oldActive = out.findings.find((f: any) => f.pageId === "concept.old-active");
    expect(oldActive.tier).toBe("decay-candidate");
    const fresh = out.findings.find((f: any) => f.pageId === "concept.fresh");
    expect(fresh.tier).toBe("fresh");
  });

  test("--archive <id> — _archive/ 로 이동 + status/archived_at frontmatter 갱신 (삭제 아님)", async () => {
    const res = run(["--archive", "concept.old-active"], env);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("archived");

    const oldPath = join(projectRoot, "memory", "concepts", "old-active.md");
    const newPath = join(projectRoot, "memory", "concepts", "_archive", "old-active.md");
    expect(existsSync(oldPath)).toBe(false);
    expect(existsSync(newPath)).toBe(true);

    const content = await Bun.file(newPath).text();
    const match = /^---\n([\s\S]*?)\n---\n/.exec(content)!;
    const fm = parse(match[1]!);
    expect(fm.status).toBe("archived");
    expect(typeof fm.archived_at).toBe("string");
    expect(fm.id).toBe("concept.old-active"); // 기존 필드 보존
  });

  test("--archive 존재하지 않는 pageId → exit 1", () => {
    const res = run(["--archive", "concept.nonexistent"], env);
    expect(res.status).toBe(1);
    expect(res.stderr.length).toBeGreaterThan(0);
  });
});
