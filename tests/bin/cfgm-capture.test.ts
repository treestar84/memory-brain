import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function capture(projectDir: string, args: string[]) {
  return spawnSync("bun", ["run", "bin/cfgm-capture.ts", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, CFGM_PROJECT_ROOT: projectDir },
    encoding: "utf-8",
  });
}

function status(projectDir: string, args: string[] = []) {
  return spawnSync("bun", ["run", "bin/cfgm-capture-status.ts", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, CFGM_PROJECT_ROOT: projectDir },
    encoding: "utf-8",
  });
}

function accept(projectDir: string, args: string[]) {
  return spawnSync("bun", ["run", "bin/cfgm-capture-accept.ts", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, CFGM_PROJECT_ROOT: projectDir },
    encoding: "utf-8",
  });
}

const SAMPLE_NOTE = `# 세션 노트\n\n오늘 결정: memory-brain 은 capture 큐를 도입한다.\n`;

describe("cfgm-capture CLI", () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "cfgm-capture-"));
    await mkdir(join(projectDir, "memory"), { recursive: true });
    await writeFile(join(projectDir, "note.md"), SAMPLE_NOTE);
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  test("입력 파일 1개 enqueue → job.md 생성 + frontmatter 필드 검증", async () => {
    const res = capture(projectDir, ["--input", "note.md", "--json"]);
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout);
    expect(out.scanned).toBe(1);
    expect(out.enqueued).toBe(1);

    const jobPath = join(projectDir, "memory/_pending/capture/jobs/note.job.md");
    const jobFile = Bun.file(jobPath);
    expect(await jobFile.exists()).toBe(true);
    const txt = await jobFile.text();
    expect(txt).toMatch(/^job_id: cap-\d{4}-\d{2}-\d{2}-note$/m);
    expect(txt).toMatch(/^status: pending$/m);
    expect(txt).toMatch(/^attempts: 0$/m);
    expect(txt).toMatch(/^max_attempts: 3$/m);
    expect(txt).toMatch(/^source_path: note\.md$/m);
    expect(txt).toMatch(/^source_sha256: [0-9a-f]{64}$/m);
    expect(txt).toMatch(/^drafts_dir: /m);
    expect(txt).toMatch(/^enqueued_at: /m);
  });

  test("같은 파일 재실행 → skipped (SHA stale 체크)", async () => {
    capture(projectDir, ["--input", "note.md"]);
    const res = capture(projectDir, ["--input", "note.md", "--json"]);
    const out = JSON.parse(res.stdout);
    expect(out.enqueued).toBe(0);
    expect(out.skipped).toBe(1);
  });

  test("--force → 재enqueue", async () => {
    capture(projectDir, ["--input", "note.md"]);
    const res = capture(projectDir, ["--input", "note.md", "--force", "--json"]);
    const out = JSON.parse(res.stdout);
    expect(out.enqueued).toBe(1);
    expect(out.skipped).toBe(0);
  });

  test("capture-status 가 pending 1건을 집계한다", async () => {
    capture(projectDir, ["--input", "note.md"]);
    const res = status(projectDir, ["--json"]);
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout);
    expect(out.counts.pending).toBe(1);
  });

  test("drafts 에 픽스처 draft 를 심고 capture-accept → memory/concepts/ 이동 + status: active 확인", async () => {
    const draftsDir = join(projectDir, "memory/_pending/capture/drafts");
    await mkdir(draftsDir, { recursive: true });
    const draft = [
      "---",
      "id: concept.capture-queue",
      "type: concept",
      "status: draft",
      "confidence: medium",
      "updated_at: 2026-07-24",
      "---",
      "",
      "# Capture 큐",
      "",
      "## Summary",
      "",
      "<!-- claim:cl-cap-capture-queue-001 -->",
      "memory-brain 은 capture 큐를 도입한다.",
      "",
      "## Evidence",
      "",
      "- `note.md` 세션 기록",
      "",
    ].join("\n");
    await writeFile(join(draftsDir, "capture-queue.md"), draft);

    const res = accept(projectDir, ["capture-queue", "--type", "concept", "--json"]);
    expect(res.status).toBe(0);

    const targetPath = join(projectDir, "memory/concepts/capture-queue.md");
    const targetFile = Bun.file(targetPath);
    expect(await targetFile.exists()).toBe(true);
    const txt = await targetFile.text();
    expect(txt).toMatch(/^status: active$/m);

    const draftFile = Bun.file(join(draftsDir, "capture-queue.md"));
    expect(await draftFile.exists()).toBe(false);
  });

  test("capture-accept 대상 중복 시 exit 1, slug 에 .. 포함 시 거부", async () => {
    const draftsDir = join(projectDir, "memory/_pending/capture/drafts");
    const conceptsDir = join(projectDir, "memory/concepts");
    await mkdir(draftsDir, { recursive: true });
    await mkdir(conceptsDir, { recursive: true });
    await writeFile(
      join(draftsDir, "dup-topic.md"),
      "---\nid: concept.dup-topic\ntype: concept\nstatus: draft\nconfidence: low\nupdated_at: 2026-07-24\n---\n\n# dup\n",
    );
    await writeFile(
      join(conceptsDir, "dup-topic.md"),
      "---\nid: concept.dup-topic\ntype: concept\nstatus: active\nconfidence: high\nupdated_at: 2026-01-01\n---\n\n# existing\n",
    );

    const resDup = accept(projectDir, ["dup-topic", "--type", "concept"]);
    expect(resDup.status).toBe(1);

    const resTraversal = accept(projectDir, ["../../etc/passwd", "--type", "concept"]);
    expect(resTraversal.status).toBe(1);
  });

  test("capture-accept <slug> — --type 생략해도 frontmatter 로 자동 추론 승격 (V3.42)", async () => {
    const draftsDir = join(projectDir, "memory/_pending/capture/drafts");
    await mkdir(draftsDir, { recursive: true });
    await writeFile(
      join(draftsDir, "auto-typed.md"),
      "---\nid: decision.auto-typed\ntype: decision\nstatus: draft\nconfidence: high\nupdated_at: 2026-07-26\n---\n\n# auto\n",
    );

    const res = accept(projectDir, ["auto-typed"]);
    expect(res.status).toBe(0);
    expect(await Bun.file(join(projectDir, "memory/decisions/auto-typed.md")).exists()).toBe(true);
  });

  test("capture-accept --all — 서로 다른 type 의 draft 여러 개를 한 번에 승격, 실패는 격리 (V3.42)", async () => {
    const draftsDir = join(projectDir, "memory/_pending/capture/drafts");
    await mkdir(draftsDir, { recursive: true });
    await writeFile(
      join(draftsDir, "d1.md"),
      "---\nid: decision.d1\ntype: decision\nstatus: draft\nconfidence: high\nupdated_at: 2026-07-26\n---\n\n# d1\n",
    );
    await writeFile(
      join(draftsDir, "c1.md"),
      "---\nid: concept.c1\ntype: concept\nstatus: draft\nconfidence: high\nupdated_at: 2026-07-26\n---\n\n# c1\n",
    );
    await writeFile(join(draftsDir, "broken.md"), "# no frontmatter at all\n");

    const res = accept(projectDir, ["--all", "--json"]);
    expect(res.status).toBe(1); // broken.md 1건 실패가 있어 exit 1

    const parsed = JSON.parse(res.stdout);
    expect(parsed.accepted).toHaveLength(2);
    expect(parsed.failed).toHaveLength(1);
    expect(parsed.failed[0].slug).toBe("broken");

    expect(await Bun.file(join(projectDir, "memory/decisions/d1.md")).exists()).toBe(true);
    expect(await Bun.file(join(projectDir, "memory/concepts/c1.md")).exists()).toBe(true);
  });

  test("capture-accept --all --reindex — 승격 직후 검색 인덱스까지 자동 재생성 (V3.42)", async () => {
    const draftsDir = join(projectDir, "memory/_pending/capture/drafts");
    await mkdir(draftsDir, { recursive: true });
    await writeFile(
      join(draftsDir, "reindex-me.md"),
      "---\nid: decision.reindex-me\ntype: decision\nstatus: draft\nconfidence: high\nupdated_at: 2026-07-26\n---\n\n# reindex-me\n\nfindable content here.\n",
    );

    const res = accept(projectDir, ["--all", "--reindex"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("인덱스 재생성 완료");

    const search = spawnSync("bun", ["run", "bin/cfgm-search.ts", "findable"], {
      cwd: process.cwd(),
      env: { ...process.env, CFGM_PROJECT_ROOT: projectDir },
      encoding: "utf-8",
    });
    expect(search.stdout).toContain("decision.reindex-me");
  });
});
