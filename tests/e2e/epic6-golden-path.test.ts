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
import { StaleDecayEngine } from "../../src/core/governance/StaleDecayEngine";
import { StructuralValidator } from "../../src/core/governance/StructuralValidator";
import { RotationEngine } from "../../src/core/governance/RotationEngine";
import { handleSessionStart } from "../../src/hooks/session-start";
import { GOVERNANCE_CONFIG, MS_PER_DAY } from "../../src/core/governance/config";
import type { FlowBlock, FlowGraph } from "../../src/core/flow/types";
import type { CanonicalEvent } from "../../src/core/events/CanonicalEvent";

const BASE_TIME = "2026-04-19T10:00:00.000Z";

function sessionEvent(sessionId: string, timestampIso: string): CanonicalEvent {
  return {
    platform: "claude-code", stage: "session-start", sessionId,
    cwd: "/project", timestampIso,
    payload: { stage: "session-start" }, raw: {}, adapterVersion: "test",
  };
}

function makeConfirmedBlock(problemId: string, blockId: string, type: FlowBlock["type"], staleAfter: string | null): FlowBlock {
  return {
    blockId, problemId, type, status: "confirmed",
    label: `${type} block ${blockId}`,
    confidence: 0.9, supportedBy: [], relations: [],
    createdAt: BASE_TIME, lastConfirmedAt: BASE_TIME,
    staleAfter, supersededBy: null, bundleId: "bnd-1",
  };
}

function makeGraph(problemId: string, blocks: FlowBlock[]): FlowGraph {
  return {
    problemId, blocks,
    cueCardMeta: { lastSyntheticAt: null, bodyHash: null, bodyBytes: 0, stale: false },
  };
}

describe("Epic 6 golden path — governance lifecycle", () => {
  let projectDir: string;
  let storage: FsStorage;
  let clock: FakeClock;
  let problemStore: ActiveProblemStore;
  let flowStore: FlowGraphStore;
  let questionQueue: QuestionQueue;
  let queue: PendingQueue;
  let ledger: RawLedger;
  let decayEngine: StaleDecayEngine;
  let validator: StructuralValidator;
  let rotationEngine: RotationEngine;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "cfgm-e6-e2e-"));
    storage = new FsStorage(join(projectDir, ".memory-brain"));
    clock = new FakeClock(new Date(BASE_TIME));
    problemStore = new ActiveProblemStore(storage, clock);
    flowStore = new FlowGraphStore(storage, clock);
    questionQueue = new QuestionQueue(storage, clock);
    queue = new PendingQueue(storage, clock);
    ledger = new RawLedger(storage, clock);
    decayEngine = new StaleDecayEngine(flowStore, clock);
    validator = new StructuralValidator(storage, clock);
    rotationEngine = new RotationEngine(storage, clock, problemStore);
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  test("stale 블록 decay → SessionStart 후 자동 supersede", async () => {
    const past = new Date(new Date(BASE_TIME).getTime() - 1000).toISOString();
    const prob = await problemStore.create("auth bug", "auth");

    const graph = makeGraph(prob.id, [
      makeConfirmedBlock(prob.id, "b-stale", "Action", past),
      makeConfirmedBlock(prob.id, "b-fresh", "Action", null),
    ]);
    await flowStore.writeSnapshot(prob.id, graph);

    clock.advance(60_000);
    await handleSessionStart(sessionEvent("s1", clock.isoNow()), {
      storage, clock, problemStore, queue, ledger,
      expirer: new Expirer(storage, clock, 7),
      bundler: new ObservationBundler(storage, clock),
      injector: new CueCardInjector(),
      fallback: new CueCardFallback(),
      decayEngine,
    });

    const snapshot = await flowStore.readSnapshot(prob.id);
    expect(snapshot!.blocks.find((b) => b.blockId === "b-stale")!.status).toBe("superseded");
    expect(snapshot!.blocks.find((b) => b.blockId === "b-fresh")!.status).toBe("confirmed");
    expect(snapshot!.cueCardMeta.stale).toBe(true);
  });

  test("그래프 구조 검증 — orphan Question 탐지", async () => {
    const prob = await problemStore.create("design issue", "design");

    const graph = makeGraph(prob.id, [
      makeConfirmedBlock(prob.id, "q1", "Question", null),
    ]);
    // q1.gapBlockId는 undefined이므로 orphan-check 위반
    graph.blocks[0].gapBlockId = "nonexistent-gap";
    await flowStore.writeSnapshot(prob.id, graph);

    const report = await validator.validate(prob.id, graph);
    expect(report.isValid).toBe(false);
    expect(report.violations.some((v) => v.ruleId === "orphan-question")).toBe(true);
  });

  test("resolve 후 90일 경과 → rotation 대상", async () => {
    const prob = await problemStore.create("old bug", "old-bug");
    await storage.writeRaw(`problems/${prob.id}/cue-card.md`, "# cue card");
    await storage.writeJsonAtomic(`problems/${prob.id}/flow-graph.json`, { blocks: [] });

    await problemStore.resolveProblem(prob.id);
    clock.advance(GOVERNANCE_CONFIG.ROTATION_DAYS * MS_PER_DAY + 1000);

    const preview = await rotationEngine.rotate({ dryRun: true });
    expect(preview.candidates).toContain(prob.id);
    expect(await storage.exists(`problems/${prob.id}/cue-card.md`)).toBe(true);

    const result = await rotationEngine.rotate({ dryRun: false });
    expect(result.rotated).toContain(prob.id);
    expect(await storage.exists(`problems/${prob.id}/cue-card.md`)).toBe(false);
    expect(await storage.exists(`.archive/${prob.id}/cue-card.md`)).toBe(true);
  });

  test("전체 생명주기: active → stale decay → resolve → rotate", async () => {
    const past = new Date(new Date(BASE_TIME).getTime() - 1000).toISOString();
    const prob = await problemStore.create("full lifecycle", "lifecycle");

    // 1. 그래프에 stale 블록 추가
    const graph = makeGraph(prob.id, [
      makeConfirmedBlock(prob.id, "b1", "Action", past),
      makeConfirmedBlock(prob.id, "b2", "Cause", null),
    ]);
    await flowStore.writeSnapshot(prob.id, graph);
    await storage.writeRaw(`problems/${prob.id}/cue-card.md`, "# card");

    // 2. SessionStart → decay 자동 수행
    clock.advance(60_000);
    await handleSessionStart(sessionEvent("s1", clock.isoNow()), {
      storage, clock, problemStore, queue, ledger,
      expirer: new Expirer(storage, clock, 7),
      bundler: new ObservationBundler(storage, clock),
      injector: new CueCardInjector(),
      fallback: new CueCardFallback(),
      decayEngine,
    });

    const snapshot = await flowStore.readSnapshot(prob.id);
    expect(snapshot!.blocks.find((b) => b.blockId === "b1")!.status).toBe("superseded");

    // 3. 구조 검증 — Cause.supportedBy 없음 → warning만
    const validReport = await validator.validate(prob.id, snapshot!);
    expect(validReport.isValid).toBe(true); // warning만 → valid
    expect(validReport.violations.some((v) => v.ruleId === "cause-needs-provenance")).toBe(true);

    // 4. 문제 해결 처리
    await problemStore.resolveProblem(prob.id);

    // 5. 90일 경과 후 rotation
    clock.advance(GOVERNANCE_CONFIG.ROTATION_DAYS * MS_PER_DAY + 1000);
    const result = await rotationEngine.rotate({ dryRun: false });
    expect(result.rotated).toContain(prob.id);

    // 6. 아카이브 상태 확인
    const all = await problemStore.listAll();
    expect(all.find((p) => p.id === prob.id)?.status).toBe("archived");
    expect(await storage.exists(`.archive/${prob.id}/cue-card.md`)).toBe(true);

    // 7. .archive/index.json 등록 확인
    const index = await storage.readJson<any>(".archive/index.json");
    expect(index.entries.some((e: { problemId: string }) => e.problemId === prob.id)).toBe(true);
  });
});
