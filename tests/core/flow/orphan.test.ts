import { describe, test, expect, beforeEach } from "bun:test";
import { OrphanBundleManager } from "../../../src/core/flow/OrphanBundleManager";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";
import type { ObservationBundle } from "../../../src/core/flow/types";

const mkOrphan = (bundleId: string, sealedAt: string): ObservationBundle => ({
  bundleId, activeProblemId: null, sessionId: "s1", turnOrdinal: 1,
  openedAt: sealedAt, sealedAt, eventIds: [], observations: [],
  metrics: { toolCallCounts: {}, touchedFiles: [], bashExit: { success: 0, failure: 0 }, promptCount: 0 },
  recentBlockIds: [], processedAt: null, processedByVersion: null,
});

describe("OrphanBundleManager", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let m: OrphanBundleManager;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));
    m = new OrphanBundleManager(storage, clock);
  });

  test("listOrphans returns unprocessed orphans", async () => {
    await storage.appendJsonl("ledger/orphan-bundles.jsonl", mkOrphan("o1", "2026-04-18T09:00:00Z"));
    expect((await m.listOrphans()).length).toBe(1);
  });

  test("attributeToProblem moves orphan to problem's bundle store", async () => {
    const orphan = mkOrphan("o1", "2026-04-18T09:00:00Z");
    await storage.appendJsonl("ledger/orphan-bundles.jsonl", orphan);
    await m.attributeToProblem("o1", "p1");

    const orphans = await m.listOrphans();
    expect(orphans).toHaveLength(0);

    const files = await storage.listFiles("ledger/bundles/2026/04/18");
    expect(files.some(f => f.includes("o1"))).toBe(true);
  });

  test("sweepExpired moves old orphans to expired bucket", async () => {
    await storage.appendJsonl("ledger/orphan-bundles.jsonl", mkOrphan("old", "2026-04-10T00:00:00Z"));
    await storage.appendJsonl("ledger/orphan-bundles.jsonl", mkOrphan("new", "2026-04-17T00:00:00Z"));
    const moved = await m.sweepExpired();
    expect(moved).toBe(1);

    const remaining = await m.listOrphans();
    expect(remaining.map(o => o.bundleId)).toEqual(["new"]);

    const expired = await storage.readJsonl("ledger/expired-bundles.jsonl");
    expect(expired).toHaveLength(1);
  });

  test("discardOrphan moves to discarded bucket", async () => {
    await storage.appendJsonl("ledger/orphan-bundles.jsonl", mkOrphan("o1", "2026-04-18T09:00:00Z"));
    await m.discardOrphan("o1", "not relevant");

    expect((await m.listOrphans()).length).toBe(0);
    const discarded = await storage.readJsonl("ledger/discarded-orphans.jsonl");
    expect(discarded).toHaveLength(1);
  });
});
