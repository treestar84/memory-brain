import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FsStorage } from "../../src/core/storage/FsStorage";
import { FakeClock } from "../../src/core/clock/Clock";
import { ActiveProblemStore } from "../../src/core/binder/ActiveProblemStore";
import { FlowGraphStore } from "../../src/core/flow/FlowGraphStore";
import { QuestionQueue } from "../../src/core/gap/QuestionQueue";
import { PendingQueue } from "../../src/core/ledger/PendingQueue";
import { RawLedger } from "../../src/core/ledger/RawLedger";
import { Expirer } from "../../src/core/ledger/Expirer";
import { ObservationBundler } from "../../src/core/flow/ObservationBundler";
import { CueCardInjector } from "../../src/core/flow/CueCardInjector";
import { CueCardFallback } from "../../src/core/flow/CueCardFallback";
import { ResumeSheetWriter } from "../../src/core/compaction/ResumeSheetWriter";
import { ResumeSheetReader } from "../../src/core/compaction/ResumeSheetReader";
import { resumeSheetPath } from "../../src/core/compaction/config";
import { handlePreCompact } from "../../src/hooks/pre-compact";
import { handleSessionStart } from "../../src/hooks/session-start";
import type { CanonicalEvent } from "../../src/core/events/CanonicalEvent";
import type { FlowBlock } from "../../src/core/flow/types";

function compactEvent(sessionId: string, timestampIso: string): CanonicalEvent {
  return {
    platform: "claude-code",
    stage: "compact-pre",
    sessionId,
    cwd: "/tmp",
    timestampIso,
    payload: { stage: "compact-pre", turnCount: 10 },
    raw: {},
    adapterVersion: "test",
  };
}

function sessionEvent(sessionId: string, timestampIso: string): CanonicalEvent {
  return {
    platform: "claude-code",
    stage: "session-start",
    sessionId,
    cwd: "/tmp",
    timestampIso,
    payload: { stage: "session-start" },
    raw: {},
    adapterVersion: "test",
  };
}

function makeActionBlock(problemId: string, blockId: string, label: string, createdAt: string): FlowBlock {
  return {
    blockId,
    problemId,
    type: "Action",
    status: "confirmed",
    label,
    confidence: 0.9,
    supportedBy: [],
    relations: [],
    createdAt,
    lastConfirmedAt: createdAt,
    staleAfter: null,
    supersededBy: null,
    bundleId: "b1",
  };
}

function makeGapBlock(problemId: string, blockId: string, subject: string, voi: number, createdAt: string): FlowBlock {
  return {
    blockId,
    problemId,
    type: "Gap",
    status: "confirmed",
    label: `gap on ${subject}`,
    confidence: 0.9,
    supportedBy: [],
    relations: [],
    createdAt,
    lastConfirmedAt: createdAt,
    staleAfter: null,
    supersededBy: null,
    bundleId: "b1",
    detectorId: "rule:orphan-action",
    subject: { blockId: subject },
    severity: 0.8,
    voiCached: voi,
  };
}

function makeQuestionBlock(problemId: string, blockId: string, gapBlockId: string, label: string, voi: number, createdAt: string): FlowBlock {
  return {
    blockId,
    problemId,
    type: "Question",
    status: "confirmed",
    label,
    confidence: 0.9,
    supportedBy: [],
    relations: [],
    createdAt,
    lastConfirmedAt: createdAt,
    staleAfter: null,
    supersededBy: null,
    bundleId: "b1",
    gapBlockId,
    lifecycle: "pending",
    askedAt: null,
    answeredByBundleId: null,
    answerBlockId: null,
    voiCached: voi,
  };
}

describe("Epic 5 golden path — compaction survival", () => {
  let projectDir: string;
  let storage: FsStorage;
  let clock: FakeClock;
  let problemStore: ActiveProblemStore;
  let flowStore: FlowGraphStore;
  let questionQueue: QuestionQueue;
  let queue: PendingQueue;
  let ledger: RawLedger;
  let expirer: Expirer;
  let bundler: ObservationBundler;
  let injector: CueCardInjector;
  let fallback: CueCardFallback;
  let writer: ResumeSheetWriter;
  let reader: ResumeSheetReader;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "cfgm-e5-e2e-"));
    storage = new FsStorage(join(projectDir, ".memory-brain"));
    clock = new FakeClock(new Date("2026-04-19T10:00:00Z"));
    problemStore = new ActiveProblemStore(storage, clock);
    flowStore = new FlowGraphStore(storage, clock);
    questionQueue = new QuestionQueue(storage, clock);
    queue = new PendingQueue(storage, clock);
    ledger = new RawLedger(storage, clock);
    expirer = new Expirer(storage, clock, 7);
    bundler = new ObservationBundler(storage, clock);
    injector = new CueCardInjector();
    fallback = new CueCardFallback();
    writer = new ResumeSheetWriter(storage, clock, problemStore, flowStore, questionQueue);
    reader = new ResumeSheetReader(storage);
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  async function seedGraphAndQueue(problemId: string): Promise<void> {
    const ts = "2026-04-19T09:30:00.000Z";
    const action = makeActionBlock(problemId, "a1", "retry login", ts);
    const gap = makeGapBlock(problemId, "g1", "a1", 0.9, ts);
    const question = makeQuestionBlock(problemId, "q1", "g1", "Did retry succeed?", 0.9, ts);

    await flowStore.appendDelta(problemId, { op: "block-add", timestampIso: ts, block: action });
    await flowStore.appendDelta(problemId, { op: "block-add", timestampIso: ts, block: gap });
    await flowStore.appendDelta(problemId, { op: "block-add", timestampIso: ts, block: question });

    await questionQueue.rebuild({
      problemId,
      blocks: [action, gap, question],
      cueCardMeta: { lastSyntheticAt: null, bodyHash: null, bodyBytes: 0, stale: false },
    });
  }

  test("PreCompact → 새 세션 SessionStart → 복원", async () => {
    const prob = await problemStore.create("auth bug", "auth");
    await seedGraphAndQueue(prob.id);

    clock.advance(60_000);
    await handlePreCompact(compactEvent("old-sid", clock.isoNow()), { ledger, writer });

    expect(await storage.exists(resumeSheetPath("old-sid"))).toBe(true);

    clock.advance(60_000);
    const out = await handleSessionStart(sessionEvent("new-sid", clock.isoNow()), {
      storage, clock, problemStore, queue, ledger, expirer,
      bundler, injector, fallback, resumeReader: reader,
    });

    expect(out).toContain("이전 세션 재개");
    expect(out).toContain("retry login");
    expect(out).toContain("Did retry succeed?");
    expect(await storage.exists(resumeSheetPath("old-sid"))).toBe(false);
  });

  test("복원 후 두 번째 SessionStart → 중복 복원 없음", async () => {
    const prob = await problemStore.create("auth bug", "auth");
    await seedGraphAndQueue(prob.id);

    clock.advance(60_000);
    await handlePreCompact(compactEvent("old-sid", clock.isoNow()), { ledger, writer });

    clock.advance(60_000);
    const deps = {
      storage, clock, problemStore, queue, ledger, expirer,
      bundler, injector, fallback, resumeReader: reader,
    };
    const first = await handleSessionStart(sessionEvent("new-sid", clock.isoNow()), deps);
    expect(first).toContain("이전 세션 재개");

    clock.advance(60_000);
    const second = await handleSessionStart(sessionEvent("newer-sid", clock.isoNow()), deps);
    expect(second).not.toContain("이전 세션 재개");
    expect(second).toContain("auth bug");
  });

  test("PreCompact 2회 연속 → 최신 상태만 유지", async () => {
    const prob = await problemStore.create("auth bug", "auth");
    await seedGraphAndQueue(prob.id);

    clock.advance(60_000);
    await handlePreCompact(compactEvent("sid-first", clock.isoNow()), { ledger, writer });

    clock.advance(60_000);
    const secondTs = clock.isoNow();
    await handlePreCompact(compactEvent("sid-second", secondTs), { ledger, writer });

    expect(await storage.exists(resumeSheetPath("sid-first"))).toBe(true);
    expect(await storage.exists(resumeSheetPath("sid-second"))).toBe(true);

    clock.advance(60_000);
    const out = await handleSessionStart(sessionEvent("new-sid", clock.isoNow()), {
      storage, clock, problemStore, queue, ledger, expirer,
      bundler, injector, fallback, resumeReader: reader,
    });

    expect(out).toContain("이전 세션 재개");
    expect(await storage.exists(resumeSheetPath("sid-first"))).toBe(false);
    expect(await storage.exists(resumeSheetPath("sid-second"))).toBe(false);
  });

  test("활성 문제 없는 상태에서 PreCompact → 복원 시 안내 스킵", async () => {
    clock.advance(60_000);
    await handlePreCompact(compactEvent("old-sid", clock.isoNow()), { ledger, writer });

    expect(await storage.exists(resumeSheetPath("old-sid"))).toBe(true);

    clock.advance(60_000);
    const out = await handleSessionStart(sessionEvent("new-sid", clock.isoNow()), {
      storage, clock, problemStore, queue, ledger, expirer,
      bundler, injector, fallback, resumeReader: reader,
    });

    expect(out).toContain("이전 세션 재개");
    expect(out).not.toContain("retry login");
    expect(out).not.toContain("Did retry succeed?");
    expect(await storage.exists(resumeSheetPath("old-sid"))).toBe(false);
  });
});
