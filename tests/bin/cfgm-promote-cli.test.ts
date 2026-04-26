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

  test("review: 빈 ledger → 후보 없음 메시지", () => {
    const res = cli("cfgm-promote-review", projectDir, []);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("후보 없음");
  });

  test("review: 1건 → ID + target 헤더 + 결정 안내", async () => {
    await seed(projectDir, [makeCandidate({ candidateId: "rev-1" })]);
    const res = cli("cfgm-promote-review", projectDir, []);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Promotion Review (pending 1건)");
    expect(res.stdout).toContain("## tools (1건)");
    expect(res.stdout).toContain("rev-1");
    expect(res.stdout).toContain("광범위 동의");
  });

  test("review: 동일 target ≥ 3 → ⚠️ 위험 마커", async () => {
    await seed(projectDir, [
      makeCandidate({ candidateId: "g1" }),
      makeCandidate({ candidateId: "g2" }),
      makeCandidate({ candidateId: "g3" }),
    ]);
    const res = cli("cfgm-promote-review", projectDir, []);
    expect(res.stdout).toContain("## tools (3건) ⚠️");
  });

  test("review --target → 필터링", async () => {
    await seed(projectDir, [
      makeCandidate({ candidateId: "t1", proposedTarget: "tools" }),
      makeCandidate({ candidateId: "s1", proposedTarget: "strategies" }),
    ]);
    const res = cli("cfgm-promote-review", projectDir, ["--target", "tools"]);
    expect(res.stdout).toContain("t1");
    expect(res.stdout).not.toContain("s1");
  });

  test("review --json → 배열", async () => {
    await seed(projectDir, [makeCandidate({ candidateId: "j1" })]);
    const res = cli("cfgm-promote-review", projectDir, ["--json"]);
    const arr = JSON.parse(res.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].candidateId).toBe("j1");
  });

  test("batch: --accept + --reject 둘 다 비면 exit 1, usage", () => {
    const res = cli("cfgm-promote-batch", projectDir, []);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("usage: cfgm-promote-batch");
  });

  test("batch: --accept 다수 → 모두 accepted", async () => {
    await seed(projectDir, [
      makeCandidate({ candidateId: "b1" }),
      makeCandidate({ candidateId: "b2" }),
    ]);
    const res = cli("cfgm-promote-batch", projectDir, [
      "--accept", "b1,b2", "--reason", "묶음 검토",
    ]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("처리됨: 2건");
    expect(res.stdout).toContain("accepted: b1");
    expect(res.stdout).toContain("accepted: b2");

    const ls = cli("cfgm-promote-list", projectDir, ["--status", "accepted", "--json"]);
    const arr = JSON.parse(ls.stdout);
    expect(arr).toHaveLength(2);
  });

  test("batch: --accept + --reject 혼합 → 각각 처리", async () => {
    await seed(projectDir, [
      makeCandidate({ candidateId: "m1" }),
      makeCandidate({ candidateId: "m2" }),
    ]);
    const res = cli("cfgm-promote-batch", projectDir, [
      "--accept", "m1", "--reject", "m2", "--reason", "혼합",
    ]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("처리됨: 2건");
  });

  test("batch: 첫 실패 시 stop + 처리/실패 리포트", async () => {
    await seed(projectDir, [makeCandidate({ candidateId: "ok1" })]);
    const res = cli("cfgm-promote-batch", projectDir, [
      "--accept", "ok1,nope-id",
    ]);
    expect(res.status).toBe(1);
    expect(res.stdout).toContain("처리됨: 1건");
    expect(res.stdout).toContain("accepted: ok1");
    expect(res.stderr).toContain("실패: 1건");
    expect(res.stderr).toContain("nope-id");
  });
});
