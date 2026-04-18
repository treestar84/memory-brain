import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FsStorage } from "../../src/core/storage/FsStorage";
import { FakeClock } from "../../src/core/clock/Clock";
import { ActiveProblemStore } from "../../src/core/binder/ActiveProblemStore";
import { RawLedger } from "../../src/core/ledger/RawLedger";
import { PendingQueue } from "../../src/core/ledger/PendingQueue";
import { ObservationBundler } from "../../src/core/flow/ObservationBundler";
import { FlowGraphStore } from "../../src/core/flow/FlowGraphStore";
import { FlowGraphProjector } from "../../src/core/flow/FlowGraphProjector";
import { OrphanActionDetector } from "../../src/core/gap/detectors/OrphanActionDetector";
import { UnsupportedHypothesisDetector } from "../../src/core/gap/detectors/UnsupportedHypothesisDetector";
import { StaleConfirmedDetector } from "../../src/core/gap/detectors/StaleConfirmedDetector";
import { UncausedProblemDetector } from "../../src/core/gap/detectors/UncausedProblemDetector";
import { LowConfidenceCriticalDetector } from "../../src/core/gap/detectors/LowConfidenceCriticalDetector";
import { ConflictingOutcomesDetector } from "../../src/core/gap/detectors/ConflictingOutcomesDetector";
import { DanglingEvidenceDetector } from "../../src/core/gap/detectors/DanglingEvidenceDetector";
import { UnmitigatedCauseDetector } from "../../src/core/gap/detectors/UnmitigatedCauseDetector";
import { VoiScorer } from "../../src/core/gap/VoiScorer";
import { QuestionLifecycleResolver } from "../../src/core/gap/QuestionLifecycleResolver";
import { QuestionQueue } from "../../src/core/gap/QuestionQueue";
import { handleUserPromptSubmit } from "../../src/hooks/user-prompt-submit";
import type { CanonicalEvent } from "../../src/core/events/CanonicalEvent";
import type { FlowDelta, FlowBlock } from "../../src/core/flow/types";

const ALL_DETECTORS = () => [
  new OrphanActionDetector(),
  new UnsupportedHypothesisDetector(),
  new StaleConfirmedDetector(),
  new UncausedProblemDetector(),
  new LowConfidenceCriticalDetector(),
  new ConflictingOutcomesDetector(),
  new DanglingEvidenceDetector(),
  new UnmitigatedCauseDetector(),
];

const ORPHAN_GAP_ID = "gap:rule:orphan-action:a1";

function actionBlock(problemId: string, now: string): FlowBlock {
  return {
    blockId: "a1",
    problemId,
    type: "Action",
    status: "confirmed",
    label: "src/auth.ts 편집",
    confidence: 0.8,
    supportedBy: [],
    relations: [],
    createdAt: now,
    lastConfirmedAt: null,
    staleAfter: null,
    supersededBy: null,
    bundleId: "bnd1",
  };
}

function questionBlock(problemId: string, now: string): FlowBlock {
  return {
    blockId: "q1",
    problemId,
    type: "Question",
    status: "confirmed",
    label: "src/auth.ts 편집 후 테스트 결과를 공유해줘",
    confidence: 1,
    supportedBy: [],
    relations: [
      { kind: "followsFrom", targetBlockId: ORPHAN_GAP_ID, confidence: 1 },
    ],
    createdAt: now,
    lastConfirmedAt: null,
    staleAfter: null,
    supersededBy: null,
    bundleId: "bnd1",
    gapBlockId: ORPHAN_GAP_ID,
    lifecycle: "pending",
  };
}

describe("Epic 3 golden path — gap detect → question → inject → answer", () => {
  let projectDir: string;
  let storage: FsStorage;
  let clock: FakeClock;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "cfgm-e3-"));
    storage = new FsStorage(join(projectDir, ".memory-brain"));
    clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  test("full cycle: Action → structural Gap → Question → inject → answer → lifecycle=answered", async () => {
    const projector = new FlowGraphProjector(
      ALL_DETECTORS(),
      new VoiScorer(),
      new QuestionLifecycleResolver(),
    );
    const graphStore = new FlowGraphStore(storage, clock);
    const queue = new QuestionQueue(storage, clock);
    const problemStore = new ActiveProblemStore(storage, clock);
    const ledger = new RawLedger(storage, clock);
    const pendingQueue = new PendingQueue(storage, clock);
    const bundler = new ObservationBundler(storage, clock);

    const prob = await problemStore.create("auth bug", "auth");

    // 1. Claude가 Action 블록 add (결과 블록 없음 → Orphan Action)
    const actionDelta: FlowDelta = {
      op: "block-add",
      timestampIso: clock.isoNow(),
      block: actionBlock(prob.id, clock.isoNow()),
    };
    await graphStore.appendDelta(prob.id, actionDelta);

    // 2. projection → OrphanAction structural Gap 산출
    let deltas = await graphStore.readDeltas(prob.id);
    let graph = projector.project(prob.id, deltas, [], clock);
    await queue.rebuild(graph);
    const gap = graph.blocks.find((b) => b.type === "Gap");
    expect(gap?.blockId).toBe(ORPHAN_GAP_ID);
    expect(gap?.detectorId).toBe("rule:orphan-action");

    // 3. Claude가 Question block add (해당 Gap 참조)
    clock.advance(60_000);
    const qDelta: FlowDelta = {
      op: "block-add",
      timestampIso: clock.isoNow(),
      block: questionBlock(prob.id, clock.isoNow()),
    };
    await graphStore.appendDelta(prob.id, qDelta);

    // 4. 재-projection + rebuild → pending 큐 반영
    deltas = await graphStore.readDeltas(prob.id);
    graph = projector.project(prob.id, deltas, await queue.listAsked(), clock);
    await queue.rebuild(graph);
    const pending = await queue.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].questionBlockId).toBe("q1");
    expect(pending[0].gapBlockId).toBe(ORPHAN_GAP_ID);

    // 5. UserPromptSubmit 훅이 주입
    clock.advance(1000);
    const stdoutInject = await handleUserPromptSubmit(
      {
        platform: "claude-code",
        stage: "prompt-submit",
        sessionId: "sess1",
        cwd: projectDir,
        timestampIso: clock.isoNow(),
        payload: { stage: "prompt-submit", message: "계속" },
        raw: {},
        adapterVersion: "claude-code@1.0",
      } as CanonicalEvent,
      {
        storage,
        clock,
        problemStore,
        queue: pendingQueue,
        ledger,
        bundler,
        questionQueue: queue,
      },
    );
    expect(stdoutInject).toContain("확인 질문");
    expect(stdoutInject).toContain("테스트 결과를");
    const askedAfter = await queue.listAsked();
    expect(askedAfter).toHaveLength(1);
    expect(askedAfter[0].questionBlockId).toBe("q1");

    // 6. Claude가 답변(Outcome) 블록 + Question supersede
    clock.advance(60_000);
    const answerDelta: FlowDelta = {
      op: "block-add",
      timestampIso: clock.isoNow(),
      block: {
        blockId: "out1",
        problemId: prob.id,
        type: "Outcome",
        status: "confirmed",
        label: "테스트 통과",
        confidence: 0.9,
        supportedBy: ["bnd2"],
        relations: [],
        createdAt: clock.isoNow(),
        lastConfirmedAt: null,
        staleAfter: null,
        supersededBy: null,
        bundleId: "bnd2",
        polarity: "+",
      },
    };
    const supersedeDelta: FlowDelta = {
      op: "block-supersede",
      timestampIso: clock.isoNow(),
      problemId: prob.id,
      blockId: "q1",
      supersededBy: "out1",
      reason: "answered",
    };
    await graphStore.appendDelta(prob.id, answerDelta);
    await graphStore.appendDelta(prob.id, supersedeDelta);

    // 7. 재-projection → Question lifecycle=answered
    deltas = await graphStore.readDeltas(prob.id);
    graph = projector.project(prob.id, deltas, await queue.listAsked(), clock);
    await queue.rebuild(graph);
    const finalQ = graph.blocks.find((b) => b.blockId === "q1")!;
    expect(finalQ.lifecycle).toBe("answered");
    expect(finalQ.answerBlockId).toBe("out1");
    expect(finalQ.answeredByBundleId).toBe("bnd2");

    // 8. pending.jsonl은 비어 있음
    expect(await queue.listPending()).toHaveLength(0);
  });

  test("stale: 30일 경과 pending Question → lifecycle=stale, pending에서 제외", async () => {
    const projector = new FlowGraphProjector(
      ALL_DETECTORS(),
      new VoiScorer(),
      new QuestionLifecycleResolver(),
    );
    const graphStore = new FlowGraphStore(storage, clock);
    const queue = new QuestionQueue(storage, clock);
    const problemStore = new ActiveProblemStore(storage, clock);

    const prob = await problemStore.create("auth bug", "auth");

    const createdIso = clock.isoNow();
    await graphStore.appendDelta(prob.id, {
      op: "block-add",
      timestampIso: createdIso,
      block: actionBlock(prob.id, createdIso),
    });
    await graphStore.appendDelta(prob.id, {
      op: "block-add",
      timestampIso: createdIso,
      block: questionBlock(prob.id, createdIso),
    });

    // 31일 경과
    clock.advance(31 * 24 * 60 * 60 * 1000);

    const deltas = await graphStore.readDeltas(prob.id);
    const graph = projector.project(prob.id, deltas, [], clock);
    await queue.rebuild(graph);

    const q = graph.blocks.find((b) => b.blockId === "q1")!;
    expect(q.lifecycle).toBe("stale");

    // pending.jsonl은 pending lifecycle만 담음 → stale 제외
    expect(await queue.listPending()).toHaveLength(0);
  });

  test("결정성: 동일 (deltas, asked, now) → 동일 current-gaps.json bytes", async () => {
    const projector = new FlowGraphProjector(
      ALL_DETECTORS(),
      new VoiScorer(),
      new QuestionLifecycleResolver(),
    );
    const graphStore = new FlowGraphStore(storage, clock);
    const queue = new QuestionQueue(storage, clock);
    const problemStore = new ActiveProblemStore(storage, clock);

    const prob = await problemStore.create("auth bug", "auth");
    const createdIso = clock.isoNow();
    await graphStore.appendDelta(prob.id, {
      op: "block-add",
      timestampIso: createdIso,
      block: actionBlock(prob.id, createdIso),
    });
    await graphStore.appendDelta(prob.id, {
      op: "block-add",
      timestampIso: createdIso,
      block: questionBlock(prob.id, createdIso),
    });

    const deltas = await graphStore.readDeltas(prob.id);

    const graph1 = projector.project(prob.id, deltas, [], clock);
    await queue.rebuild(graph1);
    const first = await storage.readText("state/current-gaps.json");

    const graph2 = projector.project(prob.id, deltas, [], clock);
    await queue.rebuild(graph2);
    const second = await storage.readText("state/current-gaps.json");

    expect(second).toBe(first);
  });
});
