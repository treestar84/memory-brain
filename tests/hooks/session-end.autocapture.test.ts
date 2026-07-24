import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { handleSessionEnd } from "../../src/hooks/session-end";
import { MemoryStorage } from "../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../src/core/clock/Clock";
import { ActiveProblemStore } from "../../src/core/binder/ActiveProblemStore";
import { RawLedger } from "../../src/core/ledger/RawLedger";
import { PendingQueue } from "../../src/core/ledger/PendingQueue";
import { ObservationBundler } from "../../src/core/flow/ObservationBundler";
import { PromotionLedger } from "../../src/core/identity/PromotionLedger";
import { CandidateDetector } from "../../src/core/identity/CandidateDetector";
import type { CanonicalEvent } from "../../src/core/events/CanonicalEvent";
import type { SessionEndDeps } from "../../src/hooks/session-end";

function makeSessionEnd(sessionId = "sess-auto-001"): CanonicalEvent {
  return {
    platform: "claude-code", stage: "session-end", sessionId,
    cwd: "/project", timestampIso: "2026-07-24T11:00:00Z",
    payload: { stage: "session-end" },
    raw: {}, adapterVersion: "claude-code@1.0",
  };
}

describe("SessionEnd 자동 capture enqueue", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let problemStore: ActiveProblemStore;
  let ledger: RawLedger;
  let queue: PendingQueue;
  let bundler: ObservationBundler;
  let promotionLedger: PromotionLedger;
  let candidateDetector: CandidateDetector;
  let tmpDir: string;
  let prevAutoCapture: string | undefined;
  let prevMin: string | undefined;

  beforeEach(async () => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-07-24T11:00:00Z"));
    problemStore = new ActiveProblemStore(storage, clock);
    ledger = new RawLedger(storage, clock);
    queue = new PendingQueue(storage, clock);
    bundler = new ObservationBundler(storage, clock);
    promotionLedger = new PromotionLedger(storage, clock);
    candidateDetector = new CandidateDetector(clock);
    tmpDir = await mkdtemp(join(tmpdir(), "session-end-autocap-"));
    prevAutoCapture = process.env.CFGM_AUTO_CAPTURE;
    prevMin = process.env.CFGM_AUTO_CAPTURE_MIN;
    delete process.env.CFGM_AUTO_CAPTURE;
    delete process.env.CFGM_AUTO_CAPTURE_MIN;
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    if (prevAutoCapture === undefined) delete process.env.CFGM_AUTO_CAPTURE;
    else process.env.CFGM_AUTO_CAPTURE = prevAutoCapture;
    if (prevMin === undefined) delete process.env.CFGM_AUTO_CAPTURE_MIN;
    else process.env.CFGM_AUTO_CAPTURE_MIN = prevMin;
  });

  function baseDeps(): SessionEndDeps {
    return { storage, clock, problemStore, ledger, queue, bundler, promotionLedger, candidateDetector, storageRoot: tmpDir };
  }

  async function openTurnWithObservations(sessionId: string, count: number) {
    await problemStore.create("bug", "bug");
    const active = (await problemStore.getActive())!;
    await bundler.openTurn(sessionId, active.id, 1);
    for (let i = 0; i < count; i++) {
      await queue.enqueue({ type: "tool:Bash", data: { exitCode: 0, cmd: `step-${i}` } }, sessionId);
    }
  }

  test("임계값 이상 observation → storage 큐에 job + source 생성", async () => {
    const sessionId = "sess-auto-001";
    await openTurnWithObservations(sessionId, 3);

    await handleSessionEnd(makeSessionEnd(sessionId), baseDeps());

    const sourcePath = resolve(tmpDir, `_pending/capture/sources/session-${sessionId}.md`);
    const sourceFile = Bun.file(sourcePath);
    expect(await sourceFile.exists()).toBe(true);
    const sourceTxt = await sourceFile.text();
    expect(sourceTxt).toContain(sessionId);
    expect(sourceTxt).toContain("tool:Bash");

    const jobPath = resolve(tmpDir, `_pending/capture/jobs/session-${sessionId}.job.md`);
    const jobFile = Bun.file(jobPath);
    expect(await jobFile.exists()).toBe(true);
    const jobTxt = await jobFile.text();
    expect(jobTxt).toMatch(/^status: pending$/m);
    expect(jobTxt).toContain("memory-brain 저장소");
  });

  test("임계값 미만 observation → enqueue 하지 않는다", async () => {
    const sessionId = "sess-auto-002";
    await openTurnWithObservations(sessionId, 1);

    await handleSessionEnd(makeSessionEnd(sessionId), baseDeps());

    const jobPath = resolve(tmpDir, `_pending/capture/jobs/session-${sessionId}.job.md`);
    expect(await Bun.file(jobPath).exists()).toBe(false);
  });

  test("CFGM_AUTO_CAPTURE=0 → 전체 skip", async () => {
    process.env.CFGM_AUTO_CAPTURE = "0";
    const sessionId = "sess-auto-003";
    await openTurnWithObservations(sessionId, 5);

    await handleSessionEnd(makeSessionEnd(sessionId), baseDeps());

    const jobPath = resolve(tmpDir, `_pending/capture/jobs/session-${sessionId}.job.md`);
    expect(await Bun.file(jobPath).exists()).toBe(false);
  });

  test("enqueue 내부 오류를 강제해도 handleSessionEnd 는 정상 반환된다", async () => {
    const sessionId = "sess-auto-004";
    await openTurnWithObservations(sessionId, 5);

    const deps: SessionEndDeps = {
      ...baseDeps(),
      captureEnqueue: async () => {
        throw new Error("강제 오류 — capture enqueue 실패 시뮬레이션");
      },
    };

    const result = await handleSessionEnd(makeSessionEnd(sessionId), deps);
    expect(result).toBeNull();

    // session-end 의 나머지 동작(problemStore 갱신 등)은 정상 수행되어야 한다.
    const active = await problemStore.getActive();
    expect(active).not.toBeNull();
  });

  test("storageRoot 미지정 시 자동 capture 를 skip 한다 (기존 hook 동작 영향 없음)", async () => {
    const sessionId = "sess-auto-005";
    await openTurnWithObservations(sessionId, 5);

    const { storageRoot, ...depsWithoutRoot } = baseDeps();
    const result = await handleSessionEnd(makeSessionEnd(sessionId), depsWithoutRoot as SessionEndDeps);
    expect(result).toBeNull();
  });

  test("CFGM_AUTO_CAPTURE_MIN 커스텀 임계값을 반영한다", async () => {
    process.env.CFGM_AUTO_CAPTURE_MIN = "1";
    const sessionId = "sess-auto-006";
    await openTurnWithObservations(sessionId, 1);

    await handleSessionEnd(makeSessionEnd(sessionId), baseDeps());

    const jobPath = resolve(tmpDir, `_pending/capture/jobs/session-${sessionId}.job.md`);
    expect(await Bun.file(jobPath).exists()).toBe(true);
  });
});
