import { describe, test, expect, beforeEach } from "bun:test";
import { ObservationBundler } from "../../../src/core/flow/ObservationBundler";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";

describe("ObservationBundler", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let b: ObservationBundler;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));
    b = new ObservationBundler(storage, clock);
  });

  test("openTurn writes current-turn state", async () => {
    await b.openTurn("sess1", "p1", 1);
    const state = await storage.readJson("state/current-turn-sess1.json");
    expect(state).toMatchObject({ sessionId: "sess1", activeProblemId: "p1", turnOrdinal: 1 });
  });

  test("sealTurn produces bundle with active problem", async () => {
    await b.openTurn("sess1", "p1", 1);
    clock.advance(5000);
    const bundle = await b.sealTurn("sess1", [{ type: "user-intent", data: { userIntentRaw: "hi" } } as any], []);
    expect(bundle).not.toBeNull();
    expect(bundle!.activeProblemId).toBe("p1");
    expect(bundle!.turnOrdinal).toBe(1);
    expect(bundle!.observations).toHaveLength(1);
  });

  test("sealTurn with no active problem goes to orphan", async () => {
    await b.openTurn("sess1", null, 1);
    const bundle = await b.sealTurn("sess1", [], []);
    expect(bundle!.activeProblemId).toBeNull();
    const orphans = await storage.readJsonl("ledger/orphan-bundles.jsonl");
    expect(orphans).toHaveLength(1);
  });

  test("sealTurn returns null if no open turn", async () => {
    const bundle = await b.sealTurn("sess_nope", [], []);
    expect(bundle).toBeNull();
  });

  test("sealTurn splits when events exceed MAX_EVENTS_PER_BUNDLE", async () => {
    await b.openTurn("sess1", "p1", 1);
    const observations = Array.from({ length: 60 }, (_, i) => ({ type: "x", data: { i } } as any));
    await b.sealTurn("sess1", observations, []);
    const list = await b.listUnprocessed("p1");
    expect(list.length).toBeGreaterThan(1);
  });

  test("listUnprocessed filters by problem", async () => {
    await b.openTurn("sess1", "p1", 1);
    await b.sealTurn("sess1", [], []);
    await b.openTurn("sess2", "p2", 1);
    await b.sealTurn("sess2", [], []);
    expect((await b.listUnprocessed("p1"))).toHaveLength(1);
    expect((await b.listUnprocessed("p2"))).toHaveLength(1);
  });

  test("markProcessed updates bundle", async () => {
    await b.openTurn("sess1", "p1", 1);
    const bundle = await b.sealTurn("sess1", [], []);
    await b.markProcessed(bundle!.bundleId, "claude-code@1.0.0");
    const list = await b.listUnprocessed("p1");
    expect(list).toHaveLength(0);
  });
});
