import { describe, test, expect, beforeEach } from "bun:test";
import { handleSessionStart } from "../../src/hooks/session-start";
import { MemoryStorage } from "../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../src/core/clock/Clock";
import { ActiveProblemStore } from "../../src/core/binder/ActiveProblemStore";
import { PendingQueue } from "../../src/core/ledger/PendingQueue";
import { RawLedger } from "../../src/core/ledger/RawLedger";
import { Expirer } from "../../src/core/ledger/Expirer";
import { ObservationBundler } from "../../src/core/flow/ObservationBundler";
import { CueCardInjector } from "../../src/core/flow/CueCardInjector";
import { CueCardFallback } from "../../src/core/flow/CueCardFallback";
import type { CanonicalEvent } from "../../src/core/events/CanonicalEvent";
import { OntologyModule } from "../../src/core/ontology/OntologyModule";
import { ResumeSheetReader } from "../../src/core/compaction/ResumeSheetReader";
import { resumeSheetPath } from "../../src/core/compaction/config";
import { RESUME_SHEET_VERSION } from "../../src/core/compaction/types";
import { StaleDecayEngine } from "../../src/core/governance/StaleDecayEngine";
import { FlowGraphStore } from "../../src/core/flow/FlowGraphStore";
import type { FlowBlock, FlowGraph } from "../../src/core/flow/types";

function makeSessionStart(sessionId = "sess-001"): CanonicalEvent {
  return {
    platform: "claude-code", stage: "session-start", sessionId, cwd: "/project",
    timestampIso: "2026-04-17T10:00:00Z", payload: { stage: "session-start" },
    raw: {}, adapterVersion: "claude-code@1.0",
  };
}

describe("SessionStart hook", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let problemStore: ActiveProblemStore;
  let queue: PendingQueue;
  let ledger: RawLedger;
  let expirer: Expirer;
  let bundler: ObservationBundler;
  let injector: CueCardInjector;
  let fallback: CueCardFallback;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-17T10:00:00Z"));
    problemStore = new ActiveProblemStore(storage, clock);
    queue = new PendingQueue(storage, clock);
    ledger = new RawLedger(storage, clock);
    expirer = new Expirer(storage, clock, 7);
    bundler = new ObservationBundler(storage, clock);
    injector = new CueCardInjector();
    fallback = new CueCardFallback();
  });

  const deps = () => ({
    storage, clock, problemStore, queue, ledger, expirer, bundler, injector, fallback,
  });

  test("emits init message on empty state", async () => {
    const output = await handleSessionStart(makeSessionStart(), deps());
    expect(output).toContain("memory-brain");
    expect(output).toContain("초기화");
  });

  test("emits active problem summary when exists", async () => {
    await problemStore.create("fix auth bug", "fix-auth");
    const output = await handleSessionStart(makeSessionStart(), deps());
    expect(output).toContain("fix auth bug");
  });

  test("includes pending queue count", async () => {
    await queue.enqueue({ type: "test", data: {} });
    await queue.enqueue({ type: "test2", data: {} });
    const output = await handleSessionStart(makeSessionStart(), deps());
    expect(output).toContain("2");
  });

  test("runs expirer sweep on startup", async () => {
    await queue.enqueue({ type: "old", data: {} });
    clock.advance(8 * 24 * 60 * 60 * 1000);
    await handleSessionStart(makeSessionStart(), deps());
    expect(await queue.count()).toBe(0);
  });

  test("appends to raw ledger", async () => {
    await handleSessionStart(makeSessionStart(), deps());
    const records = await storage.readJsonl("ledger/raw/2026/04/17/session-sess-001.jsonl");
    expect(records.length).toBe(1);
  });

  test("injects cue card when problem active and card exists", async () => {
    const prob = await problemStore.create("auth bug", "auth-bug");
    const cueCard = `---\nproblemId: ${prob.id}\nblockCount: 2\n---\n\n## 핵심 문제\nauth 타임아웃.\n`;
    await storage.writeRaw(`problems/${prob.id}/cue-card.md`, cueCard);
    const output = await handleSessionStart(makeSessionStart(), deps());
    expect(output).toContain("핵심 문제");
    expect(output).toContain("auth 타임아웃");
  });

  test("injects fallback cue card when card missing and bundles pending", async () => {
    const prob = await problemStore.create("bug", "bug");
    await bundler.openTurn("sess-001", prob.id, 1);
    await bundler.sealTurn("sess-001", [
      { type: "tool:Edit", data: { filesTouched: ["x.ts"] } },
    ], []);
    const output = await handleSessionStart(makeSessionStart(), deps());
    expect(output).toContain("awaitingSynthesis: true");
    expect(output).toContain("활동 지표");
  });

  test("emits /cfgm-process warning when unprocessed >= 3", async () => {
    const prob = await problemStore.create("bug", "bug");
    for (let i = 0; i < 3; i++) {
      await bundler.openTurn(`sess-${i}`, prob.id, 1);
      await bundler.sealTurn(`sess-${i}`, [], []);
    }
    const output = await handleSessionStart(makeSessionStart(), deps());
    expect(output).toContain("미처리 번들 3");
    expect(output).toContain("/cfgm-process");
  });
});

describe("SessionStart hook — Epic 4 ontology 주입", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let problemStore: ActiveProblemStore;
  let queue: PendingQueue;
  let ledger: RawLedger;
  let expirer: Expirer;
  let bundler: ObservationBundler;
  let injector: CueCardInjector;
  let fallback: CueCardFallback;
  let ontologyModule: OntologyModule;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));
    problemStore = new ActiveProblemStore(storage, clock);
    queue = new PendingQueue(storage, clock);
    ledger = new RawLedger(storage, clock);
    expirer = new Expirer(storage, clock, 7);
    bundler = new ObservationBundler(storage, clock);
    injector = new CueCardInjector();
    fallback = new CueCardFallback();
    ontologyModule = new OntologyModule(storage, clock);
  });

  const evt = (): CanonicalEvent => ({
    platform: "claude-code", stage: "session-start", sessionId: "sess-e4",
    cwd: "/p", timestampIso: clock.isoNow(),
    payload: { stage: "session-start" }, raw: {}, adapterVersion: "claude-code@1.0",
  });

  test("모듈 있을 때 templateId + resolvedRuns 주입", async () => {
    const prob = await problemStore.create("auth bug", "auth");
    await ontologyModule.create(prob.id, "bugfix", "1.0.0");
    const out = await handleSessionStart(evt(), {
      storage, clock, problemStore, queue, ledger, expirer,
      bundler, injector, fallback, ontologyModule,
    });
    expect(out).toContain("bugfix");
    expect(out).toContain("0 / 3");
  });

  test("resolvedRuns 1 후 반영", async () => {
    const prob = await problemStore.create("auth bug", "auth");
    await ontologyModule.create(prob.id, "bugfix", "1.0.0");
    await ontologyModule.incrementResolvedRuns(prob.id);
    const out = await handleSessionStart(evt(), {
      storage, clock, problemStore, queue, ledger, expirer,
      bundler, injector, fallback, ontologyModule,
    });
    expect(out).toContain("1 / 3");
  });

  test("ontologyModule 미전달 시 기존 동작 유지", async () => {
    await problemStore.create("auth bug", "auth");
    const out = await handleSessionStart(evt(), {
      storage, clock, problemStore, queue, ledger, expirer,
      bundler, injector, fallback,
    });
    expect(out).toContain("auth bug");
    expect(out).not.toContain("템플릿");
  });

  test("모듈 파일 없음 → 주입 스킵", async () => {
    await problemStore.create("auth bug", "auth");
    const out = await handleSessionStart(evt(), {
      storage, clock, problemStore, queue, ledger, expirer,
      bundler, injector, fallback, ontologyModule,
    });
    expect(out).not.toContain("템플릿");
  });
});

describe("SessionStart hook — Epic 5 resume-sheet 복원", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let problemStore: ActiveProblemStore;
  let queue: PendingQueue;
  let ledger: RawLedger;
  let expirer: Expirer;
  let bundler: ObservationBundler;
  let injector: CueCardInjector;
  let fallback: CueCardFallback;
  let resumeReader: ResumeSheetReader;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-19T10:00:00Z"));
    problemStore = new ActiveProblemStore(storage, clock);
    queue = new PendingQueue(storage, clock);
    ledger = new RawLedger(storage, clock);
    expirer = new Expirer(storage, clock, 7);
    bundler = new ObservationBundler(storage, clock);
    injector = new CueCardInjector();
    fallback = new CueCardFallback();
    resumeReader = new ResumeSheetReader(storage);
  });

  const evt = (): CanonicalEvent => ({
    platform: "claude-code", stage: "session-start", sessionId: "sess-new",
    cwd: "/p", timestampIso: clock.isoNow(),
    payload: { stage: "session-start" }, raw: {}, adapterVersion: "claude-code@1.0",
  });

  const deps = () => ({
    storage, clock, problemStore, queue, ledger, expirer,
    bundler, injector, fallback, resumeReader,
  });

  test("resume-sheet 있음 → 복원 헤더 + 요약 주입 + 파일 삭제", async () => {
    const prob = await problemStore.create("auth bug", "auth");
    await storage.writeJsonAtomic(resumeSheetPath("old-sid"), {
      version: RESUME_SHEET_VERSION,
      generatedAt: "2026-04-19T09:00:00.000Z",
      sessionId: "old-sid",
      problemId: prob.id,
      recentDeltas: [
        { op: "block-add", timestampIso: "2026-04-19T08:00:00Z", summary: "+ Action retry" },
      ],
      openGaps: [
        { gapBlockId: "g1", detectorId: "rule:orphan-action", subjectBlockId: "s1",
          severity: 0.8, voi: 0.7, hasQuestion: true },
      ],
      topPendingQuestions: [
        { questionBlockId: "q1", label: "Did retry succeed?", voi: 0.7 },
      ],
    });

    const out = await handleSessionStart(evt(), deps());
    expect(out).toContain("이전 세션 재개");
    expect(out).toContain("+ Action retry");
    expect(out).toContain("Did retry succeed?");
    expect(await storage.exists(resumeSheetPath("old-sid"))).toBe(false);
  });

  test("resume-sheet 없음 → 기존 동작 유지", async () => {
    await problemStore.create("auth bug", "auth");
    const out = await handleSessionStart(evt(), deps());
    expect(out).toContain("auth bug");
    expect(out).not.toContain("이전 세션 재개");
  });

  test("resumeReader 미전달 → 기존 동작 유지", async () => {
    await problemStore.create("auth bug", "auth");
    const out = await handleSessionStart(evt(), {
      storage, clock, problemStore, queue, ledger, expirer, bundler, injector, fallback,
    });
    expect(out).not.toContain("이전 세션 재개");
  });

  test("resume-sheet의 problemId가 현재 active와 다름 → 이전 문제 라벨", async () => {
    await problemStore.create("current problem", "curr");
    await storage.writeJsonAtomic(resumeSheetPath("old-sid"), {
      version: RESUME_SHEET_VERSION,
      generatedAt: "2026-04-19T09:00:00.000Z",
      sessionId: "old-sid",
      problemId: "DIFFERENT-PROBLEM-ID",
      recentDeltas: [],
      openGaps: [],
      topPendingQuestions: [],
    });
    const out = await handleSessionStart(evt(), deps());
    expect(out).toContain("이전 세션 재개");
    expect(out).toContain("이전 문제");
  });

  test("reader 예외 → 훅 계속 동작, 요약만 생략", async () => {
    await problemStore.create("auth bug", "auth");
    const brokenReader = {
      consume: async () => { throw new Error("boom"); },
    } as unknown as ResumeSheetReader;
    const out = await handleSessionStart(evt(), {
      storage, clock, problemStore, queue, ledger, expirer,
      bundler, injector, fallback, resumeReader: brokenReader,
    });
    expect(out).toContain("auth bug");
    expect(out).not.toContain("이전 세션 재개");
  });
});

describe("SessionStart hook — E6-S3 decay sweep 통합", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let problemStore: ActiveProblemStore;
  let flowStore: FlowGraphStore;
  let queue: PendingQueue;
  let ledger: RawLedger;
  let expirer: Expirer;
  let bundler: ObservationBundler;
  let injector: CueCardInjector;
  let fallback: CueCardFallback;
  let decayEngine: StaleDecayEngine;

  const BASE_TIME = "2026-04-19T10:00:00.000Z";

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date(BASE_TIME));
    problemStore = new ActiveProblemStore(storage, clock);
    flowStore = new FlowGraphStore(storage, clock);
    queue = new PendingQueue(storage, clock);
    ledger = new RawLedger(storage, clock);
    expirer = new Expirer(storage, clock, 7);
    bundler = new ObservationBundler(storage, clock);
    injector = new CueCardInjector();
    fallback = new CueCardFallback();
    decayEngine = new StaleDecayEngine(flowStore, clock);
  });

  const evt = (): CanonicalEvent => ({
    platform: "claude-code", stage: "session-start", sessionId: "sess-e6",
    cwd: "/p", timestampIso: BASE_TIME,
    payload: { stage: "session-start" }, raw: {}, adapterVersion: "claude-code@1.0",
  });

  function mkGraph(problemId: string, staleAfter: string | null): FlowGraph {
    const block: FlowBlock = {
      blockId: "b1", problemId, type: "Action", status: "confirmed",
      label: "stale action", confidence: 0.8, supportedBy: [], relations: [],
      createdAt: BASE_TIME, lastConfirmedAt: BASE_TIME,
      staleAfter, supersededBy: null, bundleId: "bnd-1",
    };
    return {
      problemId,
      blocks: [block],
      cueCardMeta: { lastSyntheticAt: null, bodyHash: null, bodyBytes: 0, stale: false },
    };
  }

  test("decayEngine 미전달 → 기존 동작 유지 (에러 없음)", async () => {
    await problemStore.create("auth bug", "auth");
    const out = await handleSessionStart(evt(), {
      storage, clock, problemStore, queue, ledger, expirer,
      bundler, injector, fallback,
    });
    expect(out).toContain("auth bug");
  });

  test("stale 블록 있는 active 문제 → SessionStart 시 자동 decay", async () => {
    const past = new Date(new Date(BASE_TIME).getTime() - 1000).toISOString();
    const prob = await problemStore.create("auth bug", "auth");
    await flowStore.writeSnapshot(prob.id, mkGraph(prob.id, past));

    await handleSessionStart(evt(), {
      storage, clock, problemStore, queue, ledger, expirer,
      bundler, injector, fallback, decayEngine,
    });

    const snapshot = await flowStore.readSnapshot(prob.id);
    expect(snapshot!.blocks[0].status).toBe("superseded");
  });

  test("stale 없는 블록 → decay 후 그대로 confirmed 유지", async () => {
    const future = new Date(new Date(BASE_TIME).getTime() + 86400_000).toISOString();
    const prob = await problemStore.create("auth bug", "auth");
    await flowStore.writeSnapshot(prob.id, mkGraph(prob.id, future));

    await handleSessionStart(evt(), {
      storage, clock, problemStore, queue, ledger, expirer,
      bundler, injector, fallback, decayEngine,
    });

    const snapshot = await flowStore.readSnapshot(prob.id);
    expect(snapshot!.blocks[0].status).toBe("confirmed");
  });

  test("decayEngine 예외 → 훅 계속 동작 (best-effort)", async () => {
    await problemStore.create("auth bug", "auth");
    const brokenEngine = {
      sweep: async () => { throw new Error("sweep failed"); },
    } as unknown as StaleDecayEngine;
    const out = await handleSessionStart(evt(), {
      storage, clock, problemStore, queue, ledger, expirer,
      bundler, injector, fallback, decayEngine: brokenEngine,
    });
    expect(out).toContain("auth bug");
  });
});
