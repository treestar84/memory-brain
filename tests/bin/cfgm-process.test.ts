import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("cfgm-process CLI", () => {
  let tmpDir: string;
  let home: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "cfgm-process-"));
    home = join(tmpDir, ".mb");
    await mkdir(join(home, "ledger/questions"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  const run = (...args: string[]) =>
    Bun.spawnSync({
      cmd: ["bun", "run", join(import.meta.dir, "../../bin/cfgm-process.ts"), ...args],
      env: { ...process.env, CFGM_HOME: home },
    });

  test("인자 없으면 usage 출력 + exit 1", () => {
    const res = run();
    expect(res.exitCode).toBe(1);
    const stderr = new TextDecoder().decode(res.stderr);
    expect(stderr).toContain("Usage:");
    expect(stderr).toContain("cfgm-process answer <question-id>");
  });

  test("answer <id> <unknown> 이 resolution 레코드를 append 한다", async () => {
    const askedPath = join(home, "ledger/questions/asked.jsonl");
    const open = {
      questionBlockId: "qA",
      gapBlockId: "gA",
      problemId: "p1",
      askedAtIso: "2026-04-20T09:00:00Z",
      sessionId: "s1",
      promptTurnOrdinal: 3,
    };
    await writeFile(askedPath, JSON.stringify(open) + "\n");

    const res = run("answer", "qA", "unknown");
    expect(res.exitCode).toBe(0);
    const stdout = new TextDecoder().decode(res.stdout);
    expect(stdout).toContain(`Resolved qA as "unknown"`);

    const raw = await readFile(askedPath, "utf8");
    const lines = raw.trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[1].resolution).toBe("unknown");
    expect(lines[1].gapBlockId).toBe("gA");
    expect(typeof lines[1].resolvedAtIso).toBe("string");
  });

  test("answer <id> <invalid> → exit 1 + 에러 메시지", () => {
    const res = run("answer", "qA", "bogus");
    expect(res.exitCode).toBe(1);
    const stderr = new TextDecoder().decode(res.stderr);
    expect(stderr).toContain("Invalid resolution");
  });

  test("매칭되는 open asked 없으면 exit 1", async () => {
    const res = run("answer", "qZ", "unknown");
    expect(res.exitCode).toBe(1);
    const stderr = new TextDecoder().decode(res.stderr);
    expect(stderr).toContain("No open asked record");
  });

  test("이미 resolved된 질문을 다시 resolve 하려면 exit 1 (멱등)", async () => {
    const askedPath = join(home, "ledger/questions/asked.jsonl");
    const open = {
      questionBlockId: "qA",
      gapBlockId: "gA",
      problemId: "p1",
      askedAtIso: "2026-04-20T09:00:00Z",
      sessionId: "s1",
      promptTurnOrdinal: 3,
    };
    await writeFile(askedPath, JSON.stringify(open) + "\n");

    const first = run("answer", "qA", "unknown");
    expect(first.exitCode).toBe(0);
    const second = run("answer", "qA", "answered");
    expect(second.exitCode).toBe(1);
    const stderr = new TextDecoder().decode(second.stderr);
    expect(stderr).toContain("No open asked record");
  });

  test("compact 서브커맨드: 소비된 item+tombstone 을 정리하고 counts 를 보고한다", async () => {
    const enqueue = run("list"); // no-op, just to ensure ledger dir exists via list first
    expect(enqueue.exitCode).toBe(0);

    const pendingPath = join(home, "ledger/pending-analysis.jsonl");
    await mkdir(join(home, "ledger"), { recursive: true });
    await writeFile(
      pendingPath,
      [
        JSON.stringify({ id: "pend-a", enqueuedAt: "2026-04-20T09:00:00Z", payload: { type: "t", data: {} } }),
        JSON.stringify({ id: "pend-b", enqueuedAt: "2026-04-20T09:00:00Z", payload: { type: "t", data: {} } }),
        JSON.stringify({ tombstone: true, id: "pend-a", at: "2026-04-20T09:01:00Z" }),
      ].join("\n") + "\n",
    );

    const res = run("compact");
    expect(res.exitCode).toBe(0);
    const stdout = new TextDecoder().decode(res.stdout);
    expect(stdout).toContain("3 record(s) -> 1 live item(s)");

    const raw = await readFile(pendingPath, "utf8");
    const lines = raw.trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toHaveLength(1);
    expect(lines[0].id).toBe("pend-b");
  });

  test("questions 서브커맨드: 빈 pending 출력", () => {
    const res = run("questions");
    expect(res.exitCode).toBe(0);
    const stdout = new TextDecoder().decode(res.stdout);
    expect(stdout).toContain("Pending questions: 0");
  });
});
