import { describe, test, expect, beforeEach } from "bun:test";
import { handleUserPromptSubmit } from "../../src/hooks/user-prompt-submit";
import { MemoryStorage } from "../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../src/core/clock/Clock";
import { ActiveProblemStore } from "../../src/core/binder/ActiveProblemStore";
import { PendingQueue } from "../../src/core/ledger/PendingQueue";
import { RawLedger } from "../../src/core/ledger/RawLedger";
import { ObservationBundler } from "../../src/core/flow/ObservationBundler";
import { QuestionQueue } from "../../src/core/gap/QuestionQueue";
import type { CanonicalEvent } from "../../src/core/events/CanonicalEvent";
import type { FlowBlock, FlowGraph } from "../../src/core/flow/types";

function makePromptSubmit(message = "Fix the bug"): CanonicalEvent {
  return {
    platform: "claude-code", stage: "prompt-submit", sessionId: "sess-001",
    cwd: "/project", timestampIso: "2026-04-17T10:00:00Z",
    payload: { stage: "prompt-submit", message },
    raw: {}, adapterVersion: "claude-code@1.0",
  };
}

describe("UserPromptSubmit hook", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let problemStore: ActiveProblemStore;
  let queue: PendingQueue;
  let ledger: RawLedger;
  let bundler: ObservationBundler;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-17T10:00:00Z"));
    problemStore = new ActiveProblemStore(storage, clock);
    queue = new PendingQueue(storage, clock);
    ledger = new RawLedger(storage, clock);
    bundler = new ObservationBundler(storage, clock);
  });

  test("appends to raw ledger", async () => {
    await handleUserPromptSubmit(makePromptSubmit(), {
      storage, clock, problemStore, queue, ledger, bundler,
    });
    const records = await storage.readJsonl("ledger/raw/2026/04/17/session-sess-001.jsonl");
    expect(records.length).toBe(1);
  });

  test("emits active problem summary", async () => {
    await problemStore.create("auth bug", "auth-bug");
    const output = await handleUserPromptSubmit(makePromptSubmit(), {
      storage, clock, problemStore, queue, ledger, bundler,
    });
    expect(output).toContain("auth bug");
  });

  test("emits null when no active problem", async () => {
    const output = await handleUserPromptSubmit(makePromptSubmit(), {
      storage, clock, problemStore, queue, ledger, bundler,
    });
    expect(output).toBeNull();
  });

  test("includes pending item hint when queue non-empty", async () => {
    await problemStore.create("test", "test");
    await queue.enqueue({ type: "user-intent", data: { message: "what about X?" } });
    const output = await handleUserPromptSubmit(makePromptSubmit(), {
      storage, clock, problemStore, queue, ledger, bundler,
    });
    expect(output).toContain("대기");
  });

  test("output is under 2KB", async () => {
    await problemStore.create("test problem", "test-problem");
    const output = await handleUserPromptSubmit(makePromptSubmit("a".repeat(500)), {
      storage, clock, problemStore, queue, ledger, bundler,
    });
    if (output) {
      expect(new TextEncoder().encode(output).length).toBeLessThanOrEqual(2048);
    }
  });

  test("opens first turn when no prior turn state exists", async () => {
    await problemStore.create("bug", "bug");
    await handleUserPromptSubmit(makePromptSubmit(), {
      storage, clock, problemStore, queue, ledger, bundler,
    });
    const state = await storage.readJson<any>("state/current-turn-sess-001.json");
    expect(state?.turnOrdinal).toBe(1);
    expect(state?.closed).toBeUndefined();
  });

  test("seals prior turn and opens next turn with incremented ordinal", async () => {
    await problemStore.create("bug", "bug");
    const active = (await problemStore.getActive())!;
    await bundler.openTurn("sess-001", active.id, 1);
    await queue.enqueue({ type: "tool:Edit", data: { filesTouched: ["a.ts"] } }, "sess-001");
    clock.advance(1000);

    await handleUserPromptSubmit(makePromptSubmit(), {
      storage, clock, problemStore, queue, ledger, bundler,
    });

    const state = await storage.readJson<any>("state/current-turn-sess-001.json");
    expect(state?.turnOrdinal).toBe(2);

    const unprocessed = await bundler.listUnprocessed();
    expect(unprocessed.length).toBe(1);
    expect(unprocessed[0].turnOrdinal).toBe(1);
    expect(unprocessed[0].observations).toHaveLength(1);

    expect(await queue.count()).toBe(0);
  });

  test("does not re-seal an already-closed turn", async () => {
    await problemStore.create("bug", "bug");
    const active = (await problemStore.getActive())!;
    await bundler.openTurn("sess-001", active.id, 1);
    await bundler.sealTurn("sess-001", [], []);
    clock.advance(1000);

    await handleUserPromptSubmit(makePromptSubmit(), {
      storage, clock, problemStore, queue, ledger, bundler,
    });

    const state = await storage.readJson<any>("state/current-turn-sess-001.json");
    expect(state?.turnOrdinal).toBe(2);
    const unprocessed = await bundler.listUnprocessed();
    expect(unprocessed).toHaveLength(1);
    expect(unprocessed[0].turnOrdinal).toBe(1);
  });
});

describe("UserPromptSubmit hook — Epic 3 Question 주입", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let problemStore: ActiveProblemStore;
  let queue: PendingQueue;
  let ledger: RawLedger;
  let bundler: ObservationBundler;
  let questionQueue: QuestionQueue;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));
    problemStore = new ActiveProblemStore(storage, clock);
    queue = new PendingQueue(storage, clock);
    ledger = new RawLedger(storage, clock);
    bundler = new ObservationBundler(storage, clock);
    questionQueue = new QuestionQueue(storage, clock);
  });

  const mkGap = (over: Partial<FlowBlock>): FlowBlock => ({
    blockId: "g1",
    problemId: "p",
    type: "Gap",
    status: "confirmed",
    label: "결손",
    confidence: 1,
    supportedBy: [],
    relations: [],
    createdAt: "2026-04-18T10:00:00Z",
    lastConfirmedAt: null,
    staleAfter: null,
    supersededBy: null,
    bundleId: "",
    detectorId: "semantic",
    subject: { blockId: "s" },
    severity: 0.5,
    voiCached: 0.5,
    ...over,
  });

  const mkQ = (over: Partial<FlowBlock>): FlowBlock => ({
    blockId: "q1",
    problemId: "p",
    type: "Question",
    status: "confirmed",
    label: "증거를 공유해줘",
    confidence: 1,
    supportedBy: [],
    relations: [],
    createdAt: "2026-04-18T10:00:00Z",
    lastConfirmedAt: null,
    staleAfter: null,
    supersededBy: null,
    bundleId: "",
    gapBlockId: "g1",
    lifecycle: "pending",
    voiCached: 0.5,
    ...over,
  });

  const mkGraph = (problemId: string, blocks: FlowBlock[]): FlowGraph => ({
    problemId,
    blocks,
    cueCardMeta: { lastSyntheticAt: null, bodyHash: null, bodyBytes: 0, stale: false },
  });

  const evt = (): CanonicalEvent => ({
    platform: "claude-code",
    stage: "prompt-submit",
    sessionId: "sess-e3",
    cwd: "/p",
    timestampIso: clock.isoNow(),
    payload: { stage: "prompt-submit", message: "continue" },
    raw: {},
    adapterVersion: "claude-code@1.0",
  });

  test("active problem 있고 pending 상위 1개 → stdout 주입 + asked append", async () => {
    const prob = await problemStore.create("bug", "bug");
    await questionQueue.rebuild(
      mkGraph(prob.id, [
        mkGap({ problemId: prob.id }),
        mkQ({ problemId: prob.id }),
      ]),
    );

    const out = await handleUserPromptSubmit(evt(), {
      storage,
      clock,
      problemStore,
      queue,
      ledger,
      bundler,
      questionQueue,
    });

    expect(out).toContain("## 🧠 memory-brain — 확인 질문");
    expect(out).toContain("증거를 공유해줘");
    const asked = await questionQueue.listAsked();
    expect(asked).toHaveLength(1);
    expect(asked[0].questionBlockId).toBe("q1");
    expect(asked[0].gapBlockId).toBe("g1");
  });

  test("gate 1 (동일 questionBlockId asked) → 스킵", async () => {
    const prob = await problemStore.create("bug", "bug");
    await questionQueue.appendAsked({
      questionBlockId: "q1",
      gapBlockId: "g1",
      problemId: prob.id,
      askedAtIso: clock.isoNow(),
      sessionId: "prev",
      promptTurnOrdinal: 1,
    });
    await questionQueue.rebuild(
      mkGraph(prob.id, [mkGap({ problemId: prob.id }), mkQ({ problemId: prob.id })]),
    );

    const out = await handleUserPromptSubmit(evt(), {
      storage,
      clock,
      problemStore,
      queue,
      ledger,
      bundler,
      questionQueue,
    });
    expect(out).not.toContain("확인 질문");
    expect((await questionQueue.listAsked()).length).toBe(1);
  });

  test("gate 2 (동일 gapBlockId asked) → 스킵", async () => {
    const prob = await problemStore.create("bug", "bug");
    await questionQueue.appendAsked({
      questionBlockId: "q1",
      gapBlockId: "g1",
      problemId: prob.id,
      askedAtIso: clock.isoNow(),
      sessionId: "prev",
      promptTurnOrdinal: 1,
    });
    await questionQueue.rebuild(
      mkGraph(prob.id, [
        mkGap({ problemId: prob.id }),
        mkQ({ blockId: "q2", problemId: prob.id, gapBlockId: "g1", label: "더 묻기" }),
      ]),
    );

    const out = await handleUserPromptSubmit(evt(), {
      storage,
      clock,
      problemStore,
      queue,
      ledger,
      bundler,
      questionQueue,
    });
    expect(out).not.toContain("확인 질문");
    expect((await questionQueue.listAsked()).length).toBe(1);
  });

  test("label > 500B → 스킵 + hook-errors.jsonl 기록", async () => {
    const prob = await problemStore.create("bug", "bug");
    const bigLabel = "가".repeat(200);
    await questionQueue.rebuild(
      mkGraph(prob.id, [
        mkGap({ problemId: prob.id }),
        mkQ({ problemId: prob.id, label: bigLabel }),
      ]),
    );

    const out = await handleUserPromptSubmit(evt(), {
      storage,
      clock,
      problemStore,
      queue,
      ledger,
      bundler,
      questionQueue,
    });
    expect(out).not.toContain("확인 질문");
    const errors = await storage.readJsonl("security/hook-errors.jsonl");
    expect(
      errors.some((e) => (e as { kind?: string }).kind === "question-oversized"),
    ).toBe(true);
  });

  test("active problem 없음 → 주입 스킵", async () => {
    const out = await handleUserPromptSubmit(evt(), {
      storage,
      clock,
      problemStore,
      queue,
      ledger,
      bundler,
      questionQueue,
    });
    expect(out).toBeNull();
  });

  test("pending 비어 있음 → 주입 스킵", async () => {
    await problemStore.create("bug", "bug");
    const out = await handleUserPromptSubmit(evt(), {
      storage,
      clock,
      problemStore,
      queue,
      ledger,
      bundler,
      questionQueue,
    });
    expect(out).not.toContain("확인 질문");
  });
});
