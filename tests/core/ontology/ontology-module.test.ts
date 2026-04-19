import { describe, test, expect, beforeEach } from "bun:test";
import { OntologyModule } from "../../../src/core/ontology/OntologyModule";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";

describe("OntologyModule", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let module: OntologyModule;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));
    module = new OntologyModule(storage, clock);
  });

  test("read returns null when no file exists", async () => {
    expect(await module.read("p1")).toBeNull();
  });

  test("create persists module and returns data", async () => {
    const data = await module.create("p1", "bugfix", "1.0.0");
    expect(data.problemId).toBe("p1");
    expect(data.templateId).toBe("bugfix");
    expect(data.resolvedRuns).toBe(0);
    expect(data.promotedAt).toBeNull();
    expect(data.observedPatterns).toEqual({});
    expect(await module.read("p1")).toEqual(data);
  });

  test("recordPatterns累積: 두 번 호출하면 합산", async () => {
    await module.create("p1", "bugfix", "1.0.0");
    await module.recordPatterns("p1", { Action: 2, Outcome: 1 });
    const after = await module.recordPatterns("p1", { Action: 1, Cause: 1 });
    expect(after.observedPatterns).toEqual({ Action: 3, Outcome: 1, Cause: 1 });
  });

  test("incrementResolvedRuns +1씩 증가", async () => {
    await module.create("p1", "bugfix", "1.0.0");
    const r1 = await module.incrementResolvedRuns("p1");
    expect(r1.resolvedRuns).toBe(1);
    const r2 = await module.incrementResolvedRuns("p1");
    expect(r2.resolvedRuns).toBe(2);
  });

  test("markPromoted sets promotedAt", async () => {
    await module.create("p1", "bugfix", "1.0.0");
    const result = await module.markPromoted("p1", "2026-04-18T12:00:00Z");
    expect(result.promotedAt).toBe("2026-04-18T12:00:00Z");
    expect((await module.read("p1"))?.promotedAt).toBe("2026-04-18T12:00:00Z");
  });

  test("recordPatterns throws when module missing", async () => {
    let threw = false;
    try { await module.recordPatterns("missing", {}); } catch { threw = true; }
    expect(threw).toBe(true);
  });

  test("incrementResolvedRuns throws when module missing", async () => {
    let threw = false;
    try { await module.incrementResolvedRuns("missing"); } catch { threw = true; }
    expect(threw).toBe(true);
  });
});
