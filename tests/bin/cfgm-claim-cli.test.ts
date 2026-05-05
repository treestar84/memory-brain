import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { FsStorage } from "../../src/core/storage/FsStorage";
import { FakeClock } from "../../src/core/clock/Clock";
import { ClaimStore } from "../../src/core/claim/ClaimStore";
import type { ClaimCandidate } from "../../src/core/claim/types";

const CLI_ENV = (projectDir: string) => ({ ...process.env, CFGM_PROJECT: projectDir });

function cli(script: string, projectDir: string, args: string[]) {
  return spawnSync("bun", ["run", `bin/${script}.ts`, ...args], {
    cwd: process.cwd(),
    env: CLI_ENV(projectDir),
    encoding: "utf-8",
  });
}

function makeCandidate(overrides: Partial<ClaimCandidate> = {}): ClaimCandidate {
  return {
    candidateId: "cc-cli-1",
    bundleId: "b1",
    blockId: "blk-1",
    proposedType: "outcome",
    proposedText: "테스트 결과 production deploy 가능",
    detectedBy: "outcome-confidence-promote",
    confidence: 0.9,
    evidence: [{ source: "flow-delta:b1:blk-1", quote: "테스트 결과" }],
    status: "pending",
    createdAt: "2026-04-28T00:00:00Z",
    decidedAt: null,
    decidedBy: null,
    reason: null,
    ...overrides,
  };
}

async function seed(projectDir: string, claims: ClaimCandidate[]) {
  const storage = new FsStorage(projectDir);
  const store = new ClaimStore(storage, new FakeClock());
  for (const c of claims) await store.append(c);
}

describe("cfgm-claim CLI (PR-A1.1)", () => {
  let projectDir: string;
  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "claim-cli-"));
  });
  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  test("accept 미존재 → exit 1", () => {
    const res = cli("cfgm-claim-accept", projectDir, ["nope"]);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("not found");
  });

  test("accept 성공 + list pending → 빈", async () => {
    await seed(projectDir, [makeCandidate({ candidateId: "c1" })]);
    const acc = cli("cfgm-claim-accept", projectDir, ["c1"]);
    expect(acc.status).toBe(0);
    expect(acc.stdout).toContain("accepted c1");

    const ls = cli("cfgm-claim-list", projectDir, []);
    expect(ls.stdout.trim()).toBe("");
  });

  test("accept 후 list --status accepted → 1건 + validFrom 설정", async () => {
    await seed(projectDir, [makeCandidate({ candidateId: "c2" })]);
    cli("cfgm-claim-accept", projectDir, ["c2"]);
    const ls = cli("cfgm-claim-list", projectDir, ["--status", "accepted", "--json"]);
    const arr = JSON.parse(ls.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].validFrom).toBeTruthy();
  });

  test("reject — reason 보존", async () => {
    await seed(projectDir, [makeCandidate({ candidateId: "c3" })]);
    const r = cli("cfgm-claim-reject", projectDir, ["c3", "--reason", "noisy detector"]);
    expect(r.status).toBe(0);
    const ls = cli("cfgm-claim-list", projectDir, ["--status", "rejected", "--json"]);
    const arr = JSON.parse(ls.stdout);
    expect(arr[0].reason).toBe("noisy detector");
  });

  test("review 빈 → '없음' 메시지", () => {
    const r = cli("cfgm-claim-review", projectDir, []);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("없음");
  });

  test("review — type 별 그룹 + ⚠️ 위험 마커 (≥3)", async () => {
    await seed(projectDir, [
      makeCandidate({ candidateId: "g1", proposedType: "outcome" }),
      makeCandidate({ candidateId: "g2", proposedType: "outcome" }),
      makeCandidate({ candidateId: "g3", proposedType: "outcome" }),
    ]);
    const r = cli("cfgm-claim-review", projectDir, []);
    expect(r.stdout).toContain("## outcome (3건) ⚠️");
  });

  test("review --type filter", async () => {
    await seed(projectDir, [
      makeCandidate({ candidateId: "t1", proposedType: "outcome" }),
      makeCandidate({ candidateId: "r1", proposedType: "rule" }),
    ]);
    const r = cli("cfgm-claim-review", projectDir, ["--type", "outcome"]);
    expect(r.stdout).toContain("t1");
    expect(r.stdout).not.toContain("r1");
  });

  test("batch 없음 → exit 1, usage", () => {
    const r = cli("cfgm-claim-batch", projectDir, []);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("usage:");
  });

  test("batch — accept + reject 혼합", async () => {
    await seed(projectDir, [
      makeCandidate({ candidateId: "b1" }),
      makeCandidate({ candidateId: "b2" }),
    ]);
    const r = cli("cfgm-claim-batch", projectDir, [
      "--accept", "b1", "--reject", "b2", "--reason", "혼합",
    ]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("처리됨: 2건");
  });

  test("batch — 첫 실패 시 stop + 처리/실패 리포트", async () => {
    await seed(projectDir, [makeCandidate({ candidateId: "ok1" })]);
    const r = cli("cfgm-claim-batch", projectDir, ["--accept", "ok1,nope-id"]);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("처리됨: 1건");
    expect(r.stderr).toContain("실패: 1건");
  });

  test("이미 accepted 재 accept --force 없음 → exit 1", async () => {
    await seed(projectDir, [makeCandidate({ candidateId: "f1", status: "accepted" })]);
    const r = cli("cfgm-claim-accept", projectDir, ["f1"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("이미 결정됨");
  });

  test("--force --reason 으로 reversal", async () => {
    await seed(projectDir, [makeCandidate({ candidateId: "f2", status: "accepted" })]);
    const r = cli("cfgm-claim-reject", projectDir, [
      "f2", "--force", "--reason", "오인 승인 회수",
    ]);
    expect(r.status).toBe(0);
  });
});
