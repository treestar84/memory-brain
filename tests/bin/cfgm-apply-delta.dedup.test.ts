import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const CLI_ENV = (projectDir: string, extras: Record<string, string> = {}) => ({
  ...process.env,
  CFGM_PROJECT: projectDir,
  ...extras,
});

const validBlock = (overrides: Record<string, unknown> = {}) => ({
  blockId: "b1",
  problemId: "p1",
  type: "Cause",
  status: "confirmed",
  label: "alpha",
  confidence: 0.7,
  supportedBy: [],
  relations: [],
  createdAt: "2026-04-25T00:00:00Z",
  lastConfirmedAt: null,
  staleAfter: null,
  supersededBy: null,
  bundleId: "bnd1",
  ...overrides,
});

function applyDelta(projectDir: string, payload: unknown, env: Record<string, string> = {}) {
  return spawnSync("bun", ["run", "bin/cfgm-apply-delta.ts"], {
    cwd: process.cwd(),
    env: CLI_ENV(projectDir, env),
    input: JSON.stringify(payload),
    encoding: "utf-8",
  });
}

describe("bin/cfgm-apply-delta dedup", () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "cfgm-dedup-"));
  });
  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  test("동일 type+label 2회 → 1차 applied, 2차 skip + audit log 1건", async () => {
    const first = applyDelta(projectDir, {
      op: "block-add",
      timestampIso: "2026-04-25T00:00:00Z",
      block: validBlock({ blockId: "b1", label: "alpha" }),
    });
    expect(first.status).toBe(0);
    expect(first.stdout).toContain("applied=1");

    const second = applyDelta(projectDir, {
      op: "block-add",
      timestampIso: "2026-04-25T00:01:00Z",
      block: validBlock({ blockId: "b2", label: "alpha" }),
    });
    expect(second.status).toBe(0);
    expect(second.stdout).toContain("applied=0");
    expect(second.stderr).toContain("delta skipped (dedup)");

    const auditPath = join(projectDir, ".memory-brain/security/dedup-skip.jsonl");
    expect(existsSync(auditPath)).toBe(true);
    const audit = (await readFile(auditPath, "utf-8")).trim().split("\n").filter(Boolean);
    expect(audit).toHaveLength(1);
    const entry = JSON.parse(audit[0]!) as Record<string, unknown>;
    expect(entry).toMatchObject({
      problemId: "p1",
      attemptedBlockId: "b2",
      type: "Cause",
      reason: "duplicate-type-label",
    });
  });

  test("같은 label, 다른 type 2회 → 둘 다 applied", () => {
    const result = applyDelta(projectDir, [
      { op: "block-add", timestampIso: "2026-04-25T00:00:00Z", block: validBlock({ blockId: "c1", type: "Cause", label: "alpha" }) },
      { op: "block-add", timestampIso: "2026-04-25T00:01:00Z", block: validBlock({ blockId: "g1", type: "Gap", label: "alpha", detectorId: "x", subject: { blockId: "c1" }, severity: 0.5, confidence: 1 }) },
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("applied=2");
  });

  test("CFGM_DEDUP_DISABLED=1 → 동일 type+label 2회 모두 applied, audit log 미생성", () => {
    const result = applyDelta(
      projectDir,
      [
        { op: "block-add", timestampIso: "2026-04-25T00:00:00Z", block: validBlock({ blockId: "b1", label: "alpha" }) },
        { op: "block-add", timestampIso: "2026-04-25T00:01:00Z", block: validBlock({ blockId: "b2", label: "alpha" }) },
      ],
      { CFGM_DEDUP_DISABLED: "1" },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("applied=2");
    expect(existsSync(join(projectDir, ".memory-brain/security/dedup-skip.jsonl"))).toBe(false);
  });

  test("supersede 후 동일 type+label 재삽입 허용", () => {
    const result = applyDelta(projectDir, [
      { op: "block-add", timestampIso: "2026-04-25T00:00:00Z", block: validBlock({ blockId: "b1", label: "alpha" }) },
      { op: "block-supersede", timestampIso: "2026-04-25T00:01:00Z", problemId: "p1", blockId: "b1", supersededBy: "decay", reason: "decay" },
      { op: "block-add", timestampIso: "2026-04-25T00:02:00Z", block: validBlock({ blockId: "b2", label: "alpha" }) },
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("applied=3");
  });
});
