import { describe, test, expect, beforeEach } from "bun:test";
import { handleSessionEnd } from "../../src/hooks/session-end";
import { MemoryStorage } from "../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../src/core/clock/Clock";
import { ActiveProblemStore } from "../../src/core/binder/ActiveProblemStore";
import { RawLedger } from "../../src/core/ledger/RawLedger";
import { PendingQueue } from "../../src/core/ledger/PendingQueue";
import { ObservationBundler } from "../../src/core/flow/ObservationBundler";
import { PromotionLedger } from "../../src/core/identity/PromotionLedger";
import { CandidateDetector, HIGH_TOOL_CALL_THRESHOLD } from "../../src/core/identity/CandidateDetector";
import type { CanonicalEvent } from "../../src/core/events/CanonicalEvent";

function makeSessionEnd(): CanonicalEvent {
  return {
    platform: "claude-code", stage: "session-end", sessionId: "sess-001",
    cwd: "/project", timestampIso: "2026-04-26T11:00:00Z",
    payload: { stage: "session-end" },
    raw: {}, adapterVersion: "claude-code@1.0",
  };
}

describe("SessionEnd → Promotion 통합", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let problemStore: ActiveProblemStore;
  let ledger: RawLedger;
  let queue: PendingQueue;
  let bundler: ObservationBundler;
  let promotionLedger: PromotionLedger;
  let candidateDetector: CandidateDetector;

  beforeEach(async () => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-26T11:00:00Z"));
    problemStore = new ActiveProblemStore(storage, clock);
    ledger = new RawLedger(storage, clock);
    queue = new PendingQueue(storage, clock);
    bundler = new ObservationBundler(storage, clock);
    promotionLedger = new PromotionLedger(storage, clock);
    candidateDetector = new CandidateDetector(clock);
    await problemStore.create("test", "test");
  });

  test("sealTurn이 임계값 만족 bundle 반환 → ledger에 후보 append", async () => {
    const active = (await problemStore.getActive())!;
    await bundler.openTurn("sess-001", active.id, 1);

    // 임계값(5) 만족 tool 호출 시뮬레이션
    for (let i = 0; i < HIGH_TOOL_CALL_THRESHOLD; i++) {
      await queue.enqueue({ type: "tool:Bash", data: { exitCode: 0 } }, "sess-001");
    }

    await handleSessionEnd(makeSessionEnd(), {
      storage, clock, problemStore, ledger, queue, bundler, promotionLedger, candidateDetector,
    });

    // ObservationBundler.deriveMetrics가 toolCallCounts를 만들어줄 거라고 가정
    // detector가 임계값 만족 → 후보 1건 이상
    const candidates = await promotionLedger.list({ status: "pending" });
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates[0]!.proposedTarget).toBe("tools");
  });

  test("sealTurn이 null이면 (열린 턴 없음) detect 스킵, ledger 빈 상태", async () => {
    await handleSessionEnd(makeSessionEnd(), {
      storage, clock, problemStore, ledger, queue, bundler, promotionLedger, candidateDetector,
    });
    const candidates = await promotionLedger.list();
    expect(candidates).toHaveLength(0);
  });
});
