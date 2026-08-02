import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function importCmd(projectDir: string, args: string[]) {
  return spawnSync("bun", ["run", "bin/cfgm-import.ts", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, CFGM_PROJECT_ROOT: projectDir },
    encoding: "utf-8",
  });
}

function line(obj: unknown): string {
  return JSON.stringify(obj);
}

const SAMPLE_TRANSCRIPT = [
  line({ type: "user", sessionId: "s1", timestamp: "2026-04-26T00:00:00Z", message: { role: "user", content: "how do I fix the bug?" } }),
  line({ type: "assistant", timestamp: "2026-04-26T00:00:05Z", message: { role: "assistant", content: [{ type: "text", text: "Here is the fix." }] } }),
].join("\n") + "\n";

describe("cfgm-import CLI", () => {
  let projectDir: string;
  let transcriptPath: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "cfgm-import-"));
    await mkdir(join(projectDir, "memory"), { recursive: true });
    transcriptPath = join(projectDir, "transcript.jsonl");
    await writeFile(transcriptPath, SAMPLE_TRANSCRIPT);
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  test("단일 파일 임포트 → memory/sources/sessions/claude-code/ 에 markdown 기록 + manifest", async () => {
    const res = importCmd(projectDir, ["--input", transcriptPath, "--json"]);
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout);
    expect(out.filesScanned).toBe(1);
    expect(out.actions.some((a: string) => a.startsWith("wrote"))).toBe(true);

    const sourcesRoot = join(projectDir, "memory", "sources", "sessions", "claude-code");
    const months = await readdir(sourcesRoot);
    expect(months).toHaveLength(1);
    const files = await readdir(join(sourcesRoot, months[0]!));
    expect(files).toHaveLength(1);
    const content = await readFile(join(sourcesRoot, months[0]!, files[0]!), "utf-8");
    expect(content).toContain("# Claude Code session — s1");
    expect(content).toContain("how do I fix the bug?");
    expect(content).toContain("Here is the fix.");

    const manifest = await readFile(join(projectDir, "memory", "sources", "_manifest.jsonl"), "utf-8");
    const entry = JSON.parse(manifest.trim());
    expect(entry.sessionId).toBe("s1");
    expect(entry.turnCount).toBe(2);
    expect(entry.enqueued).toBe(false);
  });

  test("manifest.path 와 job.md 의 source_path 는 repoRoot 기준 상대경로여야 한다 (회귀: 항목7 크로스머신 동기화 대상 파일에 이 머신 고유 절대경로가 박히면 다른 머신에서 깨진 경로를 가리킴)", async () => {
    const res = importCmd(projectDir, ["--input", transcriptPath, "--enqueue", "--json"]);
    expect(res.status).toBe(0);

    const manifest = await readFile(join(projectDir, "memory", "sources", "_manifest.jsonl"), "utf-8");
    const entry = JSON.parse(manifest.trim());
    expect(entry.path.startsWith("/")).toBe(false); // 절대경로면 프로젝트 디렉토리(/tmp/...)로 시작
    expect(entry.path).toBe("memory/sources/sessions/claude-code/2026-04/transcript--" + entry.path.split("--")[1]);

    const jobsDir = join(projectDir, "memory", "_pending", "capture", "jobs");
    const jobFiles = await readdir(jobsDir);
    expect(jobFiles.length).toBe(1);
    const jobContent = await readFile(join(jobsDir, jobFiles[0]!), "utf-8");
    const sourcePathLine = jobContent.split("\n").find((l) => l.startsWith("source_path:"));
    expect(sourcePathLine).toContain("memory/sources/sessions/claude-code/");
    expect(sourcePathLine).not.toContain(projectDir); // 이 머신의 절대경로가 섞여 들어가면 안 됨
  });

  test("재실행 시 sha256 불변이면 skip — 중복 파일 생성 안 함", async () => {
    importCmd(projectDir, ["--input", transcriptPath]);
    const res = importCmd(projectDir, ["--input", transcriptPath, "--json"]);
    const out = JSON.parse(res.stdout);
    expect(out.actions.some((a: string) => a.includes("already imported"))).toBe(true);

    const sourcesRoot = join(projectDir, "memory", "sources", "sessions", "claude-code");
    const months = await readdir(sourcesRoot);
    const files = await readdir(join(sourcesRoot, months[0]!));
    expect(files).toHaveLength(1); // 두 번째 실행에서 파일이 늘지 않음
  });

  test("--dry-run 은 아무것도 쓰지 않는다", async () => {
    const res = importCmd(projectDir, ["--input", transcriptPath, "--dry-run", "--json"]);
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout);
    expect(out.dryRun).toBe(true);
    expect(out.actions.some((a: string) => a.startsWith("would write"))).toBe(true);
    expect(existsSync(join(projectDir, "memory", "sources"))).toBe(false);
  });

  test("--enqueue --limit 1 로 두 세션 임포트 → 하나만 enqueue, 재실행하면 나머지가 이어서 enqueue (재임포트 없이)", async () => {
    const dir = join(projectDir, "transcripts");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "a.jsonl"),
      [line({ type: "user", sessionId: "sA", message: { role: "user", content: "question A" } })].join("\n"),
    );
    await writeFile(
      join(dir, "b.jsonl"),
      [line({ type: "user", sessionId: "sB", message: { role: "user", content: "question B" } })].join("\n"),
    );

    const first = importCmd(projectDir, ["--input", dir, "--enqueue", "--limit", "1", "--json"]);
    const firstOut = JSON.parse(first.stdout);
    expect(firstOut.enqueuedCount).toBe(1);
    expect(firstOut.actions.some((a: string) => a.includes("--limit 1 도달"))).toBe(true);

    const jobsDir = join(projectDir, "memory", "_pending", "capture", "jobs");
    const jobsAfterFirst = await readdir(jobsDir);
    expect(jobsAfterFirst).toHaveLength(1);

    const second = importCmd(projectDir, ["--input", dir, "--enqueue", "--limit", "5", "--json"]);
    const secondOut = JSON.parse(second.stdout);
    expect(secondOut.actions.some((a: string) => a.includes("skip (already imported"))).toBe(true);
    expect(secondOut.actions.some((a: string) => a.includes("enqueued (resumed)"))).toBe(true);

    const jobsAfterSecond = await readdir(jobsDir);
    expect(jobsAfterSecond).toHaveLength(2); // 이제 둘 다 enqueue 됨, sources/ 파일은 재기록 안 됨

    const sourcesRoot = join(projectDir, "memory", "sources", "sessions", "claude-code");
    const months = await readdir(sourcesRoot);
    const files = await readdir(join(sourcesRoot, months[0]!));
    expect(files).toHaveLength(2); // 처음 한 번씩만 기록됨

    // 회귀 재현 (직접 검증): resume 경로가 importedAt 을 새로 안 찍으면, 최초
    // (enqueued:false) 레코드와 재개(enqueued:true) 레코드의 importedAt 이
    // 똑같아진다 — 그러면 readManifestReduced 의 `>=` 비교가 동률이 되어 파일
    // 순서로 떨어지고, git union merge 로 순서가 뒤집히면 enqueued 가 false 로
    // 되돌아갈 수 있다. 수정이 맞다면 두 레코드의 importedAt 이 달라야 한다
    // (이전엔 하드코딩된 "2000-01-01" 로 동률 자체를 회피해버려 이 수정을
    // 실제로 검증하지 못하는 가짜 테스트였다 — importedAt 이 같은지를 직접 본다).
    const manifestPath = join(projectDir, "memory", "sources", "_manifest.jsonl");
    const manifestLines = (await readFile(manifestPath, "utf-8")).trim().split("\n").map((l) => JSON.parse(l));
    const bEntries = manifestLines.filter((e) => e.sourceFile.endsWith("b.jsonl"));
    expect(bEntries.length).toBe(2); // 최초(run1, enqueued:false) + 재개(run2, enqueued:true)
    const [originalEntry, resumedEntry] = bEntries;
    expect(originalEntry.enqueued).toBe(false);
    expect(resumedEntry.enqueued).toBe(true);
    expect(resumedEntry.importedAt).not.toBe(originalEntry.importedAt); // 핵심 검증 지점
    expect(resumedEntry.importedAt >= originalEntry.importedAt).toBe(true);

    // 그 위에서, 서로 다른 importedAt 덕에 파일 순서를 강제로 뒤집어도(union merge
    // 시뮬레이션) enqueued:true 쪽이 이겨야 한다는 것도 실제 CLI 실행으로 확인.
    await writeFile(manifestPath, [JSON.stringify(resumedEntry), JSON.stringify(originalEntry)].join("\n") + "\n");
    const third = importCmd(projectDir, ["--input", dir, "--enqueue", "--json"]);
    const thirdOut = JSON.parse(third.stdout);
    expect(thirdOut.enqueuedCount).toBe(0); // 이미 enqueued:true 로 봐야 하므로 재시도 없음
  });

  test("manifest reduce — importedAt 기준(파일 순서 아님), git union merge로 줄 순서 뒤섞여도 최신 enqueued 상태 유지", async () => {
    // 임포트를 먼저 정상 실행해 실제 sources/*.md + sha256 을 얻은 뒤, 매니페스트를
    // git merge=union 이 만들 법한 "뒤섞인 순서"로 직접 재작성한다: enqueued=false
    // (오래된 importedAt) 레코드가 enqueued=true(최신 importedAt) 레코드보다
    // 파일상 뒤에 오도록 — 파일 순서로 reduce 하면 여기서 틀린 답이 나온다.
    importCmd(projectDir, ["--input", transcriptPath]);
    const manifestPath = join(projectDir, "memory", "sources", "_manifest.jsonl");
    const original = JSON.parse((await readFile(manifestPath, "utf-8")).trim());

    const older = { ...original, enqueued: false, importedAt: "2026-04-26T00:00:00.000Z" };
    const newer = { ...original, enqueued: true, importedAt: "2026-04-26T00:05:00.000Z" };
    // 파일상으로는 "older(enqueued:false)"가 마지막 줄 — 순수 파일 순서 reduce라면 틀리게 이김
    await writeFile(manifestPath, [JSON.stringify(newer), JSON.stringify(older)].join("\n") + "\n");

    const res = importCmd(projectDir, ["--input", transcriptPath, "--enqueue", "--json"]);
    const out = JSON.parse(res.stdout);
    // 이미 enqueued:true 로 봐야 하므로, 다시 enqueue 시도조차 하지 않아야 한다
    expect(out.enqueuedCount).toBe(0);
    expect(out.actions.some((a: string) => a.includes("already imported"))).toBe(true);
  });

  test("turn 없는(빈) transcript 는 skip 하고 아무것도 안 씀", async () => {
    const emptyPath = join(projectDir, "empty.jsonl");
    await writeFile(emptyPath, line({ type: "queue-operation", operation: "enqueue" }) + "\n");
    const res = importCmd(projectDir, ["--input", emptyPath, "--json"]);
    const out = JSON.parse(res.stdout);
    expect(out.actions.some((a: string) => a.includes("no user/assistant text turns"))).toBe(true);
    expect(existsSync(join(projectDir, "memory", "sources"))).toBe(false);
  });

  test("디렉토리 입력 — 재귀적으로 .jsonl 전부 스캔", async () => {
    const nested = join(projectDir, "transcripts", "nested");
    await mkdir(nested, { recursive: true });
    await writeFile(join(nested, "deep.jsonl"), SAMPLE_TRANSCRIPT);
    const res = importCmd(projectDir, ["--input", join(projectDir, "transcripts"), "--json"]);
    const out = JSON.parse(res.stdout);
    expect(out.filesScanned).toBe(1);
  });

  test("존재하지 않는 --input → exit 비정상 + 에러 메시지", () => {
    const res = importCmd(projectDir, ["--input", join(projectDir, "does-not-exist.jsonl")]);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("존재하지 않음");
  });

  test("--input 없이 실행 → usage 출력 + exit 1", () => {
    const res = importCmd(projectDir, []);
    expect(res.status).toBe(1);
    expect(res.stdout).toContain("cfgm import");
  });
});
