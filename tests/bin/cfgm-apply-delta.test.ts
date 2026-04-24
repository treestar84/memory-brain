import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("cfgm-apply-delta rebuild 단일 writer", () => {
  let tmpDir: string;
  let home: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "apply-delta-"));
    home = join(tmpDir, ".mb");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  const runApply = (deltaJson: string) =>
    Bun.spawnSync({
      cmd: ["bun", "run", join(import.meta.dir, "../../bin/cfgm-apply-delta.ts")],
      env: { ...process.env, CFGM_HOME: home },
      stdin: new TextEncoder().encode(deltaJson),
    });

  test("block-add delta 적용 후 current-gaps.json 이 rebuild 로 생성된다", async () => {
    const delta = {
      op: "block-add",
      timestampIso: "2026-04-18T10:00:00Z",
      block: {
        blockId: "h1",
        problemId: "prob-1",
        type: "Hypothesis",
        status: "confirmed",
        label: "가설 H1",
        confidence: 0.9,
        supportedBy: [],
        relations: [],
        createdAt: "2026-04-18T10:00:00Z",
        lastConfirmedAt: null,
        staleAfter: null,
        supersededBy: null,
        bundleId: "bnd-1",
      },
    };
    const res = runApply(JSON.stringify(delta));
    expect(res.exitCode).toBe(0);

    const snap = JSON.parse(
      await readFile(join(home, "state/current-gaps.json"), "utf8"),
    );
    expect(snap.generatorVersion).toBe("gap-analyzer@1.0.0");
    expect(Array.isArray(snap.gaps)).toBe(true);
  });

  test("delta 실패 시 rebuild 는 호출되지 않는다 (current-gaps.json 미생성)", async () => {
    const invalidDelta = { op: "relation-add", timestampIso: "2026-04-18T10:00:00Z", problemId: "p", relation: null };
    const res = runApply(JSON.stringify(invalidDelta));
    expect(res.exitCode).toBe(1);

    let existed = true;
    try {
      await readFile(join(home, "state/current-gaps.json"), "utf8");
    } catch {
      existed = false;
    }
    expect(existed).toBe(false);
  });
});
