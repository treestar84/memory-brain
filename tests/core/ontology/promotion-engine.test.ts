import { describe, test, expect, beforeEach } from "bun:test";
import { PromotionEngine } from "../../../src/core/ontology/PromotionEngine";
import { OntologyModule } from "../../../src/core/ontology/OntologyModule";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";

describe("PromotionEngine", () => {
  let projectStorage: MemoryStorage;
  let userStorage: MemoryStorage;
  let clock: FakeClock;
  let ontologyModule: OntologyModule;
  let engine: PromotionEngine;

  beforeEach(async () => {
    projectStorage = new MemoryStorage();
    userStorage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));
    ontologyModule = new OntologyModule(projectStorage, clock);
    engine = new PromotionEngine(ontologyModule, userStorage, clock);
  });

  test("resolvedRuns < 3 → false, 복사 없음", async () => {
    await ontologyModule.create("p1", "bugfix", "1.0.0");
    await ontologyModule.incrementResolvedRuns("p1");
    await ontologyModule.incrementResolvedRuns("p1");
    const module = (await ontologyModule.read("p1"))!;
    const result = await engine.maybePromote(module);
    expect(result).toBe(false);
    expect(await userStorage.exists("ontologies/promoted/bugfix/p1.yaml")).toBe(false);
  });

  test("resolvedRuns >= 3 → true, 복사 완료", async () => {
    await ontologyModule.create("p1", "bugfix", "1.0.0");
    for (let i = 0; i < 3; i++) await ontologyModule.incrementResolvedRuns("p1");
    const module = (await ontologyModule.read("p1"))!;
    const result = await engine.maybePromote(module);
    expect(result).toBe(true);
    expect(await userStorage.exists("ontologies/promoted/bugfix/p1.yaml")).toBe(true);
  });

  test("승격 후 projectStorage의 promotedAt 갱신", async () => {
    await ontologyModule.create("p1", "bugfix", "1.0.0");
    for (let i = 0; i < 3; i++) await ontologyModule.incrementResolvedRuns("p1");
    const module = (await ontologyModule.read("p1"))!;
    await engine.maybePromote(module);
    const updated = await ontologyModule.read("p1");
    expect(updated?.promotedAt).toBe(clock.isoNow());
  });

  test("이미 승격됨 → false, 중복 복사 없음", async () => {
    await ontologyModule.create("p1", "bugfix", "1.0.0");
    for (let i = 0; i < 3; i++) await ontologyModule.incrementResolvedRuns("p1");
    const module = (await ontologyModule.read("p1"))!;
    await engine.maybePromote(module);
    const already = (await ontologyModule.read("p1"))!;
    const result = await engine.maybePromote(already);
    expect(result).toBe(false);
  });

  test("minResolvedRuns 커스텀 설정 가능", async () => {
    const strictEngine = new PromotionEngine(ontologyModule, userStorage, clock, 5);
    await ontologyModule.create("p2", "architecture", "1.0.0");
    for (let i = 0; i < 3; i++) await ontologyModule.incrementResolvedRuns("p2");
    const module = (await ontologyModule.read("p2"))!;
    const result = await strictEngine.maybePromote(module);
    expect(result).toBe(false);
  });
});
