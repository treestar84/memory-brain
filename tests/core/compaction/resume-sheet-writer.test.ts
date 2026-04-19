import { describe, test, expect, beforeEach } from "bun:test";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";
import { ResumeSheetWriter } from "../../../src/core/compaction/ResumeSheetWriter";
import { ActiveProblemStore } from "../../../src/core/binder/ActiveProblemStore";
import { FlowGraphStore } from "../../../src/core/flow/FlowGraphStore";
import { QuestionQueue } from "../../../src/core/gap/QuestionQueue";
import { resumeSheetPath, RESUME_CONFIG } from "../../../src/core/compaction/config";
import { RESUME_SHEET_VERSION } from "../../../src/core/compaction/types";
import type { FlowDelta, FlowGraph } from "../../../src/core/flow/types";

describe("ResumeSheetWriter", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let problemStore: ActiveProblemStore;
  let flowStore: FlowGraphStore;
  let questionQueue: QuestionQueue;
  let writer: ResumeSheetWriter;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-19T10:00:00Z"));
    problemStore = new ActiveProblemStore(storage, clock);
    flowStore = new FlowGraphStore(storage, clock);
    questionQueue = new QuestionQueue(storage, clock);
    writer = new ResumeSheetWriter(storage, clock, problemStore, flowStore, questionQueue);
  });

  test("활성 문제 없음 → problemId null 빈 sheet 기록", async () => {
    await writer.write("sid-1");
    const sheet = await storage.readJson<any>(resumeSheetPath("sid-1"));
    expect(sheet).not.toBeNull();
    expect(sheet.version).toBe(RESUME_SHEET_VERSION);
    expect(sheet.sessionId).toBe("sid-1");
    expect(sheet.problemId).toBeNull();
    expect(sheet.recentDeltas).toEqual([]);
    expect(sheet.openGaps).toEqual([]);
    expect(sheet.topPendingQuestions).toEqual([]);
  });

  test("활성 문제 있음 → 기본 수집", async () => {
    const prob = await problemStore.create("auth bug", "auth");
    const delta: FlowDelta = {
      op: "block-add",
      timestampIso: "2026-04-19T09:00:00Z",
      block: {
        blockId: "b1", problemId: prob.id, type: "Action", status: "confirmed",
        label: "retry login", confidence: 0.8, supportedBy: [], relations: [],
        createdAt: "2026-04-19T09:00:00Z", lastConfirmedAt: null,
        staleAfter: null, supersededBy: null, bundleId: "bund-1",
      },
    };
    await flowStore.appendDelta(prob.id, delta);

    await writer.write("sid-1");
    const sheet = await storage.readJson<any>(resumeSheetPath("sid-1"));
    expect(sheet.problemId).toBe(prob.id);
    expect(sheet.recentDeltas.length).toBe(1);
    expect(sheet.recentDeltas[0].op).toBe("block-add");
    expect(sheet.recentDeltas[0].summary).toContain("retry login");
  });

  test("델타 100개 → 최신 20개만 포함", async () => {
    const prob = await problemStore.create("p", "p");
    for (let i = 0; i < 100; i++) {
      await flowStore.appendDelta(prob.id, {
        op: "block-add",
        timestampIso: `2026-04-19T09:${String(i).padStart(2, "0")}:00Z`,
        block: {
          blockId: `b${i}`, problemId: prob.id, type: "Action", status: "confirmed",
          label: `action-${i}`, confidence: 0.8, supportedBy: [], relations: [],
          createdAt: "2026-04-19T09:00:00Z", lastConfirmedAt: null,
          staleAfter: null, supersededBy: null, bundleId: "b",
        },
      });
    }
    await writer.write("sid-1");
    const sheet = await storage.readJson<any>(resumeSheetPath("sid-1"));
    expect(sheet.recentDeltas.length).toBe(RESUME_CONFIG.MAX_DELTAS);
    // 최신 20개 — b80~b99
    expect(sheet.recentDeltas[0].summary).toContain("action-80");
    expect(sheet.recentDeltas[19].summary).toContain("action-99");
  });

  test("gap/question 수집 — voi 상위 N개", async () => {
    const prob = await problemStore.create("p", "p");
    const blocks = [];
    for (let i = 0; i < 15; i++) {
      blocks.push({
        blockId: `g${i}`, problemId: prob.id, type: "Gap" as const, status: "confirmed" as const,
        label: `gap-${i}`, confidence: 0.5, supportedBy: [], relations: [],
        createdAt: "2026-04-19T09:00:00Z", lastConfirmedAt: null,
        staleAfter: null, supersededBy: null, bundleId: "b",
        detectorId: "rule:orphan-action",
        subject: { blockId: `s${i}` },
        severity: 0.5,
        voiCached: i * 0.05,
      });
    }
    for (let i = 0; i < 10; i++) {
      blocks.push({
        blockId: `q${i}`, problemId: prob.id, type: "Question" as const, status: "confirmed" as const,
        label: `Q-${i}`, confidence: 0.5, supportedBy: [], relations: [],
        createdAt: "2026-04-19T09:00:00Z", lastConfirmedAt: null,
        staleAfter: null, supersededBy: null, bundleId: "b",
        gapBlockId: `g${i}`, lifecycle: "pending" as const,
        askedAt: null, answeredByBundleId: null, answerBlockId: null,
        voiCached: i * 0.1,
      });
    }
    const graph: FlowGraph = {
      problemId: prob.id,
      blocks,
      cueCardMeta: { lastSyntheticAt: null, bodyHash: null, bodyBytes: 0, stale: false },
    };
    await questionQueue.rebuild(graph);

    await writer.write("sid-1");
    const sheet = await storage.readJson<any>(resumeSheetPath("sid-1"));
    expect(sheet.openGaps.length).toBe(RESUME_CONFIG.MAX_GAPS);
    expect(sheet.openGaps[0].voi).toBeGreaterThanOrEqual(sheet.openGaps[1].voi);
    expect(sheet.topPendingQuestions.length).toBe(RESUME_CONFIG.MAX_PENDING_QUESTIONS);
    expect(sheet.topPendingQuestions[0].voi).toBeGreaterThanOrEqual(
      sheet.topPendingQuestions[1].voi,
    );
  });

  test("generatedAt은 clock.isoNow()", async () => {
    clock.set(new Date("2026-04-19T15:30:00Z"));
    await writer.write("sid-1");
    const sheet = await storage.readJson<any>(resumeSheetPath("sid-1"));
    expect(sheet.generatedAt).toBe("2026-04-19T15:30:00.000Z");
  });

  test("동일 sessionId 재기록 → 최신 상태만 유지", async () => {
    await writer.write("sid-1");
    clock.advance(60_000);
    await writer.write("sid-1");
    const sheet = await storage.readJson<any>(resumeSheetPath("sid-1"));
    expect(sheet.generatedAt).toBe("2026-04-19T10:01:00.000Z");
  });
});
