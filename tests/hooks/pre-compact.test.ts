import { describe, test, expect, beforeEach } from "bun:test";
import { MemoryStorage } from "../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../src/core/clock/Clock";
import { ActiveProblemStore } from "../../src/core/binder/ActiveProblemStore";
import { FlowGraphStore } from "../../src/core/flow/FlowGraphStore";
import { QuestionQueue } from "../../src/core/gap/QuestionQueue";
import { RawLedger } from "../../src/core/ledger/RawLedger";
import { ResumeSheetWriter } from "../../src/core/compaction/ResumeSheetWriter";
import { handlePreCompact } from "../../src/hooks/pre-compact";
import { resumeSheetPath } from "../../src/core/compaction/config";
import type { CanonicalEvent } from "../../src/core/events/CanonicalEvent";

function compactEvent(sessionId: string): CanonicalEvent {
  return {
    platform: "claude-code",
    stage: "compact-pre",
    sessionId,
    cwd: "/tmp",
    timestampIso: "2026-04-19T10:00:00.000Z",
    payload: { stage: "compact-pre", turnCount: 42 },
    raw: {},
    adapterVersion: "test",
  };
}

describe("handlePreCompact", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let deps: Parameters<typeof handlePreCompact>[1];

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-19T10:00:00Z"));
    const problemStore = new ActiveProblemStore(storage, clock);
    const flowStore = new FlowGraphStore(storage, clock);
    const questionQueue = new QuestionQueue(storage, clock);
    const ledger = new RawLedger(storage, clock);
    const writer = new ResumeSheetWriter(storage, clock, problemStore, flowStore, questionQueue);
    deps = { ledger, writer };
  });

  test("활성 문제 없음 → 빈 sheet 기록 + ledger append", async () => {
    const event = compactEvent("sid-1");
    const result = await handlePreCompact(event, deps);
    expect(result).toBeNull();
    const sheet = await storage.readJson<any>(resumeSheetPath("sid-1"));
    expect(sheet?.problemId).toBeNull();
    expect(sheet?.sessionId).toBe("sid-1");
    const events = await storage.readJsonl("ledger/raw/2026/04/19/session-sid-1.jsonl");
    expect(events.length).toBe(1);
  });

  test("정상 흐름 → null 반환 (stdout 없음)", async () => {
    const result = await handlePreCompact(compactEvent("sid-1"), deps);
    expect(result).toBeNull();
  });

  test("sessionId가 그대로 경로에 반영", async () => {
    await handlePreCompact(compactEvent("sid-abcdef"), deps);
    expect(await storage.exists(resumeSheetPath("sid-abcdef"))).toBe(true);
  });
});
