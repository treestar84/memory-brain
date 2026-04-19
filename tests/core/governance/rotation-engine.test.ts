import { describe, test, expect, beforeEach } from "bun:test";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";
import { ActiveProblemStore } from "../../../src/core/binder/ActiveProblemStore";
import { RotationEngine } from "../../../src/core/governance/RotationEngine";
import { GOVERNANCE_CONFIG, MS_PER_DAY } from "../../../src/core/governance/config";

const BASE_TIME = new Date("2026-04-19T10:00:00.000Z");

describe("RotationEngine", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let problemStore: ActiveProblemStore;
  let engine: RotationEngine;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(BASE_TIME);
    problemStore = new ActiveProblemStore(storage, clock);
    engine = new RotationEngine(storage, clock, problemStore);
  });

  test("dry-run 기본 — 이동하지 않고 후보 목록만 반환", async () => {
    const prob = await problemStore.create("old bug", "old-bug");
    await problemStore.resolveProblem(prob.id);
    clock.advance(GOVERNANCE_CONFIG.ROTATION_DAYS * MS_PER_DAY + 1);

    await storage.writeJsonAtomic(`problems/${prob.id}/cue-card.md`, {});
    const result = await engine.rotate({ dryRun: true });
    expect(result.candidates).toHaveLength(1);
    expect(result.rotated).toHaveLength(0);
    expect(await storage.exists(`problems/${prob.id}/cue-card.md`)).toBe(true);
  });

  test("apply — 파일을 .archive/<id>/ 로 이동", async () => {
    const prob = await problemStore.create("old bug", "old-bug");
    await problemStore.resolveProblem(prob.id);
    clock.advance(GOVERNANCE_CONFIG.ROTATION_DAYS * MS_PER_DAY + 1);

    await storage.writeJsonAtomic(`problems/${prob.id}/cue-card.md`, { content: "card" });
    await storage.writeJsonAtomic(`problems/${prob.id}/flow-graph.json`, { content: "graph" });

    const result = await engine.rotate({ dryRun: false });
    expect(result.rotated).toHaveLength(1);
    expect(result.rotated[0]).toBe(prob.id);

    expect(await storage.exists(`problems/${prob.id}/cue-card.md`)).toBe(false);
    expect(await storage.exists(`.archive/${prob.id}/cue-card.md`)).toBe(true);
    expect(await storage.exists(`.archive/${prob.id}/flow-graph.json`)).toBe(true);
  });

  test("apply — .archive/index.json 갱신", async () => {
    const prob = await problemStore.create("old bug", "old-bug");
    await problemStore.resolveProblem(prob.id);
    clock.advance(GOVERNANCE_CONFIG.ROTATION_DAYS * MS_PER_DAY + 1);
    await storage.writeJsonAtomic(`problems/${prob.id}/cue-card.md`, {});

    await engine.rotate({ dryRun: false });

    const index = await storage.readJson<any>(".archive/index.json");
    expect(index).not.toBeNull();
    expect(index.entries).toHaveLength(1);
    expect(index.entries[0].problemId).toBe(prob.id);
    expect(index.entries[0].archivedAt).toBeDefined();
  });

  test("active 문제 → rotation 대상 아님", async () => {
    const prob = await problemStore.create("active bug", "active-bug");
    clock.advance(GOVERNANCE_CONFIG.ROTATION_DAYS * MS_PER_DAY + 1);
    await storage.writeJsonAtomic(`problems/${prob.id}/cue-card.md`, {});

    const result = await engine.rotate({ dryRun: false });
    expect(result.candidates).toHaveLength(0);
    expect(await storage.exists(`problems/${prob.id}/cue-card.md`)).toBe(true);
  });

  test("resolved이지만 ROTATION_DAYS 미만 — rotation 대상 아님", async () => {
    const prob = await problemStore.create("recent bug", "recent-bug");
    await problemStore.resolveProblem(prob.id);
    clock.advance(GOVERNANCE_CONFIG.ROTATION_DAYS * MS_PER_DAY - 1);

    const result = await engine.rotate({ dryRun: false });
    expect(result.candidates).toHaveLength(0);
  });

  test("apply — archived status로 변경", async () => {
    const prob = await problemStore.create("old bug", "old-bug");
    await problemStore.resolveProblem(prob.id);
    clock.advance(GOVERNANCE_CONFIG.ROTATION_DAYS * MS_PER_DAY + 1);

    await engine.rotate({ dryRun: false });

    const all = await problemStore.listAll();
    const archived = all.find((p) => p.id === prob.id);
    expect(archived?.status).toBe("archived");
  });

  test("이미 archived — 재처리 안 함", async () => {
    const prob = await problemStore.create("old bug", "old-bug");
    await problemStore.resolveProblem(prob.id);
    await problemStore.archiveProblem(prob.id);
    clock.advance(GOVERNANCE_CONFIG.ROTATION_DAYS * MS_PER_DAY + 1);

    const result = await engine.rotate({ dryRun: false });
    expect(result.candidates).toHaveLength(0);
  });

  test("빈 problems → 빈 결과, 오류 없음", async () => {
    const result = await engine.rotate({ dryRun: false });
    expect(result.candidates).toHaveLength(0);
    expect(result.rotated).toHaveLength(0);
  });
});
