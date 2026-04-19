import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FsStorage } from "../../src/core/storage/FsStorage";
import { FakeClock } from "../../src/core/clock/Clock";
import { ActiveProblemStore } from "../../src/core/binder/ActiveProblemStore";
import { OntologyModule } from "../../src/core/ontology/OntologyModule";
import { PromotionEngine } from "../../src/core/ontology/PromotionEngine";
import { MemoryStorage } from "../../src/core/storage/MemoryStorage";

describe("Epic 4 golden path — create → record × 3 → promote", () => {
  let projectDir: string;
  let projectStorage: FsStorage;
  let userStorage: MemoryStorage;
  let clock: FakeClock;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "cfgm-e4-e2e-"));
    projectStorage = new FsStorage(join(projectDir, ".memory-brain"));
    userStorage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  test("문제 생성 → 3회 합성 → 승격", async () => {
    const ontologyModule = new OntologyModule(projectStorage, clock);
    const promotionEngine = new PromotionEngine(ontologyModule, userStorage, clock);
    const problemStore = new ActiveProblemStore(projectStorage, clock, ontologyModule);

    const prob = await problemStore.create("auth bug", "auth", "bugfix");

    const initial = await ontologyModule.read(prob.id);
    expect(initial?.templateId).toBe("bugfix");
    expect(initial?.resolvedRuns).toBe(0);

    for (let i = 1; i <= 3; i++) {
      clock.advance(60_000);
      await ontologyModule.recordPatterns(prob.id, { Action: 1, Outcome: 1 });
      const updated = await ontologyModule.incrementResolvedRuns(prob.id);
      expect(updated.resolvedRuns).toBe(i);
      const promoted = await promotionEngine.maybePromote(updated);
      if (i < 3) {
        expect(promoted).toBe(false);
      } else {
        expect(promoted).toBe(true);
      }
    }

    const final = await ontologyModule.read(prob.id);
    expect(final?.resolvedRuns).toBe(3);
    expect(final?.promotedAt).not.toBeNull();
    expect(final?.observedPatterns).toEqual({ Action: 3, Outcome: 3 });
    expect(await userStorage.exists(`ontologies/promoted/bugfix/${prob.id}.yaml`)).toBe(true);
  });

  test("4번째 maybePromote 호출 → no-op (이미 승격)", async () => {
    const ontologyModule = new OntologyModule(projectStorage, clock);
    const promotionEngine = new PromotionEngine(ontologyModule, userStorage, clock);
    const problemStore = new ActiveProblemStore(projectStorage, clock, ontologyModule);
    const prob = await problemStore.create("p", "p", "bugfix");

    for (let i = 0; i < 3; i++) await ontologyModule.incrementResolvedRuns(prob.id);
    const m3 = (await ontologyModule.read(prob.id))!;
    await promotionEngine.maybePromote(m3);

    const m4 = (await ontologyModule.read(prob.id))!;
    expect(await promotionEngine.maybePromote(m4)).toBe(false);
  });

  test("general-task 기본 템플릿 사용 시 promoted 경로 일치", async () => {
    const ontologyModule = new OntologyModule(projectStorage, clock);
    const promotionEngine = new PromotionEngine(ontologyModule, userStorage, clock);
    const problemStore = new ActiveProblemStore(projectStorage, clock, ontologyModule);
    const prob = await problemStore.create("p", "p");

    for (let i = 0; i < 3; i++) await ontologyModule.incrementResolvedRuns(prob.id);
    const m = (await ontologyModule.read(prob.id))!;
    await promotionEngine.maybePromote(m);
    expect(
      await userStorage.exists(`ontologies/promoted/general-task/${prob.id}.yaml`),
    ).toBe(true);
  });
});
