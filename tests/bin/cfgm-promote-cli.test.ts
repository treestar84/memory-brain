import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { FsStorage } from "../../src/core/storage/FsStorage";
import { FakeClock } from "../../src/core/clock/Clock";
import { PromotionLedger } from "../../src/core/identity/PromotionLedger";
import type { PromotedCandidate } from "../../src/core/identity/types";

const CLI_ENV = (projectDir: string) => ({ ...process.env, CFGM_PROJECT: projectDir });

function cli(script: string, projectDir: string, args: string[]) {
  return spawnSync("bun", ["run", `bin/${script}.ts`, ...args], {
    cwd: process.cwd(),
    env: CLI_ENV(projectDir),
    encoding: "utf-8",
  });
}

function makeCandidate(overrides: Partial<PromotedCandidate> = {}): PromotedCandidate {
  return {
    candidateId: "cand-cli-1",
    bundleId: "bnd-x",
    proposedTarget: "tools",
    proposedLabel: "tool 사용 패턴: Bash (5회)",
    detectedBy: "high-tool-call-pattern",
    metrics: { toolCallCount: 5 },
    status: "pending",
    createdAt: "2026-04-26T00:00:00Z",
    decidedAt: null,
    decidedBy: null,
    reason: null,
    ...overrides,
  };
}

async function seed(projectDir: string, candidates: PromotedCandidate[]) {
  const storage = new FsStorage(join(projectDir, ".memory-brain"));
  const ledger = new PromotionLedger(storage, new FakeClock());
  for (const c of candidates) await ledger.append(c);
}

describe("cfgm-promote CLI", () => {
  let projectDir: string;
  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "promo-cli-"));
  });
  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  test("list: 빈 ledger → exit 0, 빈 출력", () => {
    const res = cli("cfgm-promote-list", projectDir, []);
    expect(res.status).toBe(0);
    expect(res.stdout.trim()).toBe("");
  });

  test("list --json: JSON.parse 성공", async () => {
    await seed(projectDir, [makeCandidate({ candidateId: "c1" })]);
    const res = cli("cfgm-promote-list", projectDir, ["--json"]);
    expect(res.status).toBe(0);
    const arr = JSON.parse(res.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].candidateId).toBe("c1");
  });

  test("accept 미존재 → exit 1, stderr 에러", () => {
    const res = cli("cfgm-promote-accept", projectDir, ["nope"]);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("not found");
  });

  test("accept 성공 후 list 기본(pending) → 빈", async () => {
    await seed(projectDir, [makeCandidate({ candidateId: "c1" })]);
    const acc = cli("cfgm-promote-accept", projectDir, ["c1"]);
    expect(acc.status).toBe(0);
    expect(acc.stdout).toContain("accepted c1");

    const ls = cli("cfgm-promote-list", projectDir, []);
    expect(ls.stdout.trim()).toBe("");
  });

  test("accept 후 list --status accepted → 1건", async () => {
    await seed(projectDir, [makeCandidate({ candidateId: "c1" })]);
    cli("cfgm-promote-accept", projectDir, ["c1"]);

    const ls = cli("cfgm-promote-list", projectDir, ["--status", "accepted", "--json"]);
    const arr = JSON.parse(ls.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].status).toBe("accepted");
  });

  test("reject 동일 패턴", async () => {
    await seed(projectDir, [makeCandidate({ candidateId: "c2" })]);
    const rj = cli("cfgm-promote-reject", projectDir, ["c2", "--reason", "noisy rule"]);
    expect(rj.status).toBe(0);
    expect(rj.stdout).toContain("rejected c2");

    const ls = cli("cfgm-promote-list", projectDir, ["--status", "rejected", "--json"]);
    const arr = JSON.parse(ls.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].reason).toBe("noisy rule");
  });

  test("이미 accepted를 --force 없이 accept → exit 1", async () => {
    await seed(projectDir, [makeCandidate({ candidateId: "c3" })]);
    cli("cfgm-promote-accept", projectDir, ["c3"]);
    const second = cli("cfgm-promote-accept", projectDir, ["c3"]);
    expect(second.status).toBe(1);
    expect(second.stderr).toContain("이미 결정됨");
  });

  test("--force --reason으로 reversal → exit 0, status 갱신", async () => {
    await seed(projectDir, [makeCandidate({ candidateId: "c4" })]);
    cli("cfgm-promote-accept", projectDir, ["c4"]);
    const reversed = cli("cfgm-promote-reject", projectDir, [
      "c4", "--force", "--reason", "오인 승인 회수",
    ]);
    expect(reversed.status).toBe(0);

    const ls = cli("cfgm-promote-list", projectDir, ["--status", "rejected", "--json"]);
    const arr = JSON.parse(ls.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].candidateId).toBe("c4");
    expect(arr[0].reason).toBe("오인 승인 회수");
  });
});
