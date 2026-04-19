import { describe, test, expect, beforeEach } from "bun:test";
import { ActiveProblemStore } from "../../../src/core/binder/ActiveProblemStore";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";
import { OntologyModule } from "../../../src/core/ontology/OntologyModule";

describe("ActiveProblemStore", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let store: ActiveProblemStore;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-17T10:00:00Z"));
    store = new ActiveProblemStore(storage, clock);
  });

  test("getActive returns null when no problem exists", async () => {
    expect(await store.getActive()).toBeNull();
  });

  test("create sets new active problem", async () => {
    const p = await store.create("fix auth bug", "fix-auth-bug");
    expect(p.id).toMatch(/^prob-/);
    expect(p.slug).toBe("fix-auth-bug");
    expect(p.title).toBe("fix auth bug");
    const active = await store.getActive();
    expect(active?.id).toBe(p.id);
  });

  test("switch changes active problem", async () => {
    const p1 = await store.create("problem 1", "prob-1");
    const p2 = await store.create("problem 2", "prob-2");
    expect((await store.getActive())?.id).toBe(p2.id);
    await store.switchTo(p1.id);
    expect((await store.getActive())?.id).toBe(p1.id);
  });

  test("switch to nonexistent throws", async () => {
    expect(store.switchTo("prob-nonexistent")).rejects.toThrow();
  });

  test("updateLastConfirmed updates timestamp", async () => {
    await store.create("test", "test");
    clock.advance(60_000);
    await store.updateLastConfirmed();
    const active = await store.getActive();
    expect(active?.lastConfirmedAt).toBe(clock.isoNow());
  });

  test("getHistory returns all problems", async () => {
    await store.create("p1", "p1");
    await store.create("p2", "p2");
    await store.create("p3", "p3");
    const history = await store.getHistory();
    expect(history.length).toBe(3);
  });

  test("getSummary returns markdown string", async () => {
    await store.create("fix login", "fix-login");
    const summary = await store.getSummary();
    expect(summary).toContain("fix login");
  });

  test("getSummary returns empty message when no active", async () => {
    const summary = await store.getSummary();
    expect(summary).toContain("활성 문제 없음");
  });
});

describe("ActiveProblemStore — ontologyModule 연동", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));
  });

  test("create with ontologyModule → module 파일 생성", async () => {
    const ontologyModule = new OntologyModule(storage, clock);
    const store = new ActiveProblemStore(storage, clock, ontologyModule);
    const prob = await store.create("auth bug", "auth", "bugfix");
    const mod = await ontologyModule.read(prob.id);
    expect(mod?.templateId).toBe("bugfix");
    expect(mod?.resolvedRuns).toBe(0);
  });

  test("create without ontologyModule → 모듈 파일 미생성 (하위호환)", async () => {
    const store = new ActiveProblemStore(storage, clock);
    const prob = await store.create("auth bug", "auth");
    const content = await storage.readText(`problems/${prob.id}/ontology.module.yaml`);
    expect(content).toBeNull();
  });

  test("create templateId 기본값 general-task", async () => {
    const ontologyModule = new OntologyModule(storage, clock);
    const store = new ActiveProblemStore(storage, clock, ontologyModule);
    const prob = await store.create("auth bug", "auth");
    const mod = await ontologyModule.read(prob.id);
    expect(mod?.templateId).toBe("general-task");
  });
});

describe("ActiveProblemStore — status lifecycle (E6-S1)", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let store: ActiveProblemStore;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-19T10:00:00Z"));
    store = new ActiveProblemStore(storage, clock);
  });

  test("create → status는 active, resolvedAt은 null", async () => {
    const p = await store.create("auth bug", "auth");
    expect(p.status).toBe("active");
    expect(p.resolvedAt).toBeNull();
  });

  test("resolveProblem → status resolved, resolvedAt 설정", async () => {
    const p = await store.create("auth bug", "auth");
    clock.advance(60_000);
    const resolved = await store.resolveProblem(p.id);
    expect(resolved.status).toBe("resolved");
    expect(resolved.resolvedAt).toBe(clock.isoNow());
  });

  test("resolveProblem 후 getActive → null (resolved는 active가 아님)", async () => {
    const p = await store.create("auth bug", "auth");
    await store.resolveProblem(p.id);
    const active = await store.getActive();
    expect(active).toBeNull();
  });

  test("resolve된 problem이 있어도 다른 active problem은 getActive로 반환", async () => {
    const p1 = await store.create("auth bug", "auth");
    const p2 = await store.create("second", "second");
    await store.resolveProblem(p1.id);
    await store.switchTo(p2.id);
    const active = await store.getActive();
    expect(active?.id).toBe(p2.id);
  });

  test("resolveProblem — 존재하지 않는 id → 에러", async () => {
    await expect(store.resolveProblem("prob-not-exist")).rejects.toThrow();
  });

  test("listResolved → resolved 상태 문제만 반환", async () => {
    const p1 = await store.create("first", "first");
    await store.create("second", "second");
    await store.resolveProblem(p1.id);
    const resolved = await store.listResolved();
    expect(resolved).toHaveLength(1);
    expect(resolved[0].id).toBe(p1.id);
  });

  test("archiveProblem → status archived", async () => {
    const p = await store.create("auth bug", "auth");
    await store.resolveProblem(p.id);
    const archived = await store.archiveProblem(p.id);
    expect(archived.status).toBe("archived");
  });

  test("backward compat — status 필드 없는 기존 파일을 active로 읽음", async () => {
    await storage.writeJsonAtomic("state/active-problem.json", {
      activeId: "prob-legacy",
      problems: [{
        id: "prob-legacy",
        title: "legacy",
        slug: "legacy",
        createdAt: "2026-01-01T00:00:00Z",
        lastConfirmedAt: "2026-01-01T00:00:00Z",
        // status, resolvedAt 필드 없음
      }],
    });
    const active = await store.getActive();
    expect(active?.id).toBe("prob-legacy");
    expect(active?.status).toBe("active");
    expect(active?.resolvedAt).toBeNull();
  });
});
