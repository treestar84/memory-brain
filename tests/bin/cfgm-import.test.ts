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

    // 회귀 재현: enqueue(resumed) 로 갱신된 레코드가 원래(enqueued:false) 레코드와
    // importedAt 이 같아지면, git union merge 가 줄 순서를 뒤집었을 때 파일 순서
    // 폴백으로 enqueued 상태가 false 로 되돌아갈 수 있었다. 이제 resume 시
    // importedAt 도 갱신하므로 순서를 강제로 뒤집어도 true 가 이겨야 한다.
    const manifestPath = join(projectDir, "memory", "sources", "_manifest.jsonl");
    const manifestLines = (await readFile(manifestPath, "utf-8")).trim().split("\n").map((l) => JSON.parse(l));
    // manifest 는 append-only 라 b.jsonl 항목이 2줄(최초 enqueued:false + 재개 enqueued:true)
    // 있을 수 있다 — reduce 없이 그냥 마지막 걸 집는다(파일이 아직 안 섞인 상태이므로 안전).
    const bEntry = [...manifestLines].reverse().find((e) => e.sourceFile.endsWith("b.jsonl"));
    expect(bEntry.enqueued).toBe(true);
    const bEntryOldFalse = { ...bEntry, enqueued: false, importedAt: "2000-01-01T00:00:00.000Z" };
    // "resumed:true" 항목을 파일 맨 앞에, "오래된 false" 항목을 맨 뒤에 둬서 순서를 강제로 뒤집는다
    await writeFile(manifestPath, [JSON.stringify(bEntry), JSON.stringify(bEntryOldFalse)].map((l) => l).join("\n") + "\n");
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
