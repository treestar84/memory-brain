import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const CLI_ENV = (projectDir: string) => ({
  ...process.env,
  CFGM_PROJECT: projectDir,
});

const validBlock = (overrides: Record<string, unknown> = {}) => {
  const blockId = (overrides.blockId as string | undefined) ?? "b1";
  return {
    blockId,
    problemId: "p1",
    type: "Cause",
    status: "confirmed",
    label: `test block ${blockId}`,
    confidence: 0.7,
    supportedBy: [],
    relations: [],
    createdAt: "2026-04-18T00:00:00Z",
    lastConfirmedAt: null,
    staleAfter: null,
    supersededBy: null,
    bundleId: "bnd1",
    ...overrides,
  };
};

describe("bin/cfgm-list-bundles", () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "cfgm-cli-list-"));
  });
  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  test("returns empty json array when no bundles", () => {
    const result = spawnSync("bun", ["run", "bin/cfgm-list-bundles.ts", "--unprocessed", "--json"], {
      cwd: process.cwd(),
      env: CLI_ENV(projectDir),
      encoding: "utf-8",
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([]);
  });

  test("lists a sealed bundle via json", async () => {
    // Seed a bundle on disk
    const bundleDir = join(projectDir, ".memory-brain", "ledger", "bundles", "2026", "04", "18");
    await mkdir(bundleDir, { recursive: true });
    const bundle = {
      bundleId: "bnd_sess_t1",
      activeProblemId: "p1",
      sessionId: "sess",
      turnOrdinal: 1,
      openedAt: "2026-04-18T10:00:00Z",
      sealedAt: "2026-04-18T10:05:00Z",
      eventIds: [],
      observations: [{ type: "tool:Edit", data: {} }],
      metrics: { toolCallCounts: {}, touchedFiles: [], bashExit: { success: 0, failure: 0 }, promptCount: 0 },
      recentBlockIds: [],
      processedAt: null,
      processedByVersion: null,
    };
    await writeFile(join(bundleDir, "bnd_sess_t1.json"), JSON.stringify(bundle));

    const result = spawnSync("bun", ["run", "bin/cfgm-list-bundles.ts", "--unprocessed", "--json"], {
      cwd: process.cwd(),
      env: CLI_ENV(projectDir),
      encoding: "utf-8",
    });
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].bundleId).toBe("bnd_sess_t1");
    expect(parsed[0].eventCount).toBe(1);
  });
});

describe("bin/cfgm-apply-delta", () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "cfgm-cli-apply-"));
  });
  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  test("applies single block-add delta via stdin", () => {
    const delta = {
      op: "block-add",
      timestampIso: "2026-04-18T00:00:00Z",
      block: validBlock(),
    };
    const result = spawnSync("bun", ["run", "bin/cfgm-apply-delta.ts"], {
      cwd: process.cwd(),
      env: CLI_ENV(projectDir),
      input: JSON.stringify(delta),
      encoding: "utf-8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("applied=1");
  });

  test("applies array of deltas and writes snapshot", () => {
    const deltas = [
      { op: "block-add", timestampIso: "2026-04-18T00:00:00Z", block: validBlock() },
      { op: "block-add", timestampIso: "2026-04-18T00:01:00Z", block: validBlock({ blockId: "b2" }) },
    ];
    const result = spawnSync("bun", ["run", "bin/cfgm-apply-delta.ts"], {
      cwd: process.cwd(),
      env: CLI_ENV(projectDir),
      input: JSON.stringify(deltas),
      encoding: "utf-8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("applied=2");
  });

  test("rejects invalid delta with non-zero exit", () => {
    const result = spawnSync("bun", ["run", "bin/cfgm-apply-delta.ts"], {
      cwd: process.cwd(),
      env: CLI_ENV(projectDir),
      input: '{"op":"invalid"}',
      encoding: "utf-8",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr.toLowerCase()).toContain("delta");
  });
});

describe("bin/cfgm-inspect-graph", () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "cfgm-cli-inspect-"));
  });
  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  test("returns empty graph json when no deltas", () => {
    const result = spawnSync("bun", ["run", "bin/cfgm-inspect-graph.ts", "--problem", "p1", "--format", "json"], {
      cwd: process.cwd(),
      env: CLI_ENV(projectDir),
      encoding: "utf-8",
    });
    expect(result.status).toBe(0);
    const graph = JSON.parse(result.stdout);
    expect(graph.blocks).toEqual([]);
  });

  test("reflects applied deltas after apply-delta", () => {
    const delta = { op: "block-add", timestampIso: "2026-04-18T00:00:00Z", block: validBlock() };
    const apply = spawnSync("bun", ["run", "bin/cfgm-apply-delta.ts"], {
      cwd: process.cwd(),
      env: CLI_ENV(projectDir),
      input: JSON.stringify(delta),
      encoding: "utf-8",
    });
    expect(apply.status).toBe(0);

    const inspect = spawnSync("bun", ["run", "bin/cfgm-inspect-graph.ts", "--problem", "p1", "--format", "json"], {
      cwd: process.cwd(),
      env: CLI_ENV(projectDir),
      encoding: "utf-8",
    });
    expect(inspect.status).toBe(0);
    const graph = JSON.parse(inspect.stdout);
    expect(graph.blocks).toHaveLength(1);
    expect(graph.blocks[0].blockId).toBe("b1");
  });

  test("--filter gap keeps only Gap blocks, excluding other types", () => {
    const causeDelta = {
      op: "block-add",
      timestampIso: "2026-04-18T00:00:00Z",
      block: validBlock({ blockId: "c1", type: "Cause" }),
    };
    const gapDelta = {
      op: "block-add",
      timestampIso: "2026-04-18T00:01:00Z",
      block: validBlock({
        blockId: "gap:semantic:c1",
        type: "Gap",
        confidence: 1,
        detectorId: "semantic",
        subject: { blockId: "c1" },
        severity: 0.5,
      }),
    };
    const apply = spawnSync("bun", ["run", "bin/cfgm-apply-delta.ts"], {
      cwd: process.cwd(),
      env: CLI_ENV(projectDir),
      input: JSON.stringify([causeDelta, gapDelta]),
      encoding: "utf-8",
    });
    expect(apply.status).toBe(0);

    const inspect = spawnSync(
      "bun",
      [
        "run",
        "bin/cfgm-inspect-graph.ts",
        "--problem",
        "p1",
        "--format",
        "json",
        "--filter",
        "gap",
      ],
      { cwd: process.cwd(), env: CLI_ENV(projectDir), encoding: "utf-8" },
    );
    expect(inspect.status).toBe(0);
    const graph = JSON.parse(inspect.stdout);
    expect(graph.blocks).toHaveLength(1);
    expect(graph.blocks[0].type).toBe("Gap");
    expect(graph.blocks[0].blockId).toBe("gap:semantic:c1");
  });
});
