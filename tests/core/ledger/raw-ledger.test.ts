import { describe, test, expect, beforeEach } from "bun:test";
import { RawLedger } from "../../../src/core/ledger/RawLedger";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";
import type { CanonicalEvent } from "../../../src/core/events/CanonicalEvent";

function makeEvent(overrides: Partial<CanonicalEvent> = {}): CanonicalEvent {
  return {
    platform: "claude-code",
    stage: "tool-post",
    sessionId: "sess-001",
    cwd: "/project",
    timestampIso: "2026-04-17T10:00:00.000Z",
    payload: { stage: "tool-post", toolName: "Edit", toolInput: {}, toolOutput: "ok", correlationId: "c1" },
    raw: {},
    adapterVersion: "claude-code@1.0",
    ...overrides,
  };
}

describe("RawLedger", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let ledger: RawLedger;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-17T10:00:00Z"));
    ledger = new RawLedger(storage, clock);
  });

  test("appends event to session-based JSONL path", async () => {
    await ledger.append(makeEvent());
    const records = await storage.readJsonl("ledger/raw/2026/04/17/session-sess-001.jsonl");
    expect(records.length).toBe(1);
  });

  test("includes event hash in ledger entry", async () => {
    await ledger.append(makeEvent());
    const records = await storage.readJsonl<{ hash: string }>("ledger/raw/2026/04/17/session-sess-001.jsonl");
    expect(records[0].hash).toBeDefined();
    expect(typeof records[0].hash).toBe("string");
  });

  test("multiple events append in order", async () => {
    await ledger.append(makeEvent({ timestampIso: "2026-04-17T10:00:00Z" }));
    await ledger.append(makeEvent({ timestampIso: "2026-04-17T10:01:00Z" }));
    await ledger.append(makeEvent({ timestampIso: "2026-04-17T10:02:00Z" }));
    const records = await storage.readJsonl<{ event: CanonicalEvent }>("ledger/raw/2026/04/17/session-sess-001.jsonl");
    expect(records.length).toBe(3);
    expect(records[0].event.timestampIso).toBe("2026-04-17T10:00:00Z");
    expect(records[2].event.timestampIso).toBe("2026-04-17T10:02:00Z");
  });

  test("different sessions go to different files", async () => {
    await ledger.append(makeEvent({ sessionId: "sess-A" }));
    await ledger.append(makeEvent({ sessionId: "sess-B" }));
    const a = await storage.readJsonl("ledger/raw/2026/04/17/session-sess-A.jsonl");
    const b = await storage.readJsonl("ledger/raw/2026/04/17/session-sess-B.jsonl");
    expect(a.length).toBe(1);
    expect(b.length).toBe(1);
  });

  test("concurrent appends preserve all records", async () => {
    const promises = Array.from({ length: 50 }, (_, i) =>
      ledger.append(makeEvent({ timestampIso: `2026-04-17T10:00:${String(i).padStart(2, "0")}Z` }))
    );
    await Promise.all(promises);
    const records = await storage.readJsonl("ledger/raw/2026/04/17/session-sess-001.jsonl");
    expect(records.length).toBe(50);
  });

  test("date in path matches clock, not event timestamp", async () => {
    clock.set("2026-05-01T00:00:00Z");
    await ledger.append(makeEvent({ timestampIso: "2026-04-17T10:00:00Z" }));
    const records = await storage.readJsonl("ledger/raw/2026/05/01/session-sess-001.jsonl");
    expect(records.length).toBe(1);
  });
});
