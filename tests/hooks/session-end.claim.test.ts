import { describe, test, expect, beforeEach } from "bun:test";
import { handleSessionEnd } from "../../src/hooks/session-end";
import { MemoryStorage } from "../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../src/core/clock/Clock";
import { ActiveProblemStore } from "../../src/core/binder/ActiveProblemStore";
import { RawLedger } from "../../src/core/ledger/RawLedger";
import { PendingQueue } from "../../src/core/ledger/PendingQueue";
import { ObservationBundler } from "../../src/core/flow/ObservationBundler";
import { FlowGraphStore } from "../../src/core/flow/FlowGraphStore";
import { FlowGraphProjector } from "../../src/core/flow/FlowGraphProjector";
import { ClaimStore } from "../../src/core/claim/ClaimStore";
import { FlowBlockToClaimCandidate } from "../../src/core/claim/FlowBlockToClaimCandidate";
import type { CanonicalEvent } from "../../src/core/events/CanonicalEvent";
import type { FlowBlock } from "../../src/core/flow/types";

function makeSessionEnd(): CanonicalEvent {
  return {
    platform: "claude-code", stage: "session-end", sessionId: "sess-claim-001",
    cwd: "/project", timestampIso: "2026-04-26T11:00:00Z",
    payload: { stage: "session-end" },
    raw: {}, adapterVersion: "claude-code@1.0",
  };
}

function makeOutcomeBlock(blockId: string, confidence: number, problemId: string): FlowBlock {
  return {
    blockId, problemId, type: "Outcome", status: "confirmed",
    label: `outcome ${blockId}`, confidence,
    supportedBy: [], relations: [],
    createdAt: "2026-04-26T10:00:00Z",
    lastConfirmedAt: null, staleAfter: null, supersededBy: null,
    bundleId: "bnd-x",
  };
}

describe("SessionEnd → Claim sidecar 통합", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let problemStore: ActiveProblemStore;
  let ledger: RawLedger;
  let queue: PendingQueue;
  let bundler: ObservationBundler;
  let flowStore: FlowGraphStore;
  let flowGraphProjector: FlowGraphProjector;
  let claimStore: ClaimStore;
  let flowBlockToClaim: FlowBlockToClaimCandidate;

  beforeEach(async () => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-26T11:00:00Z"));
    problemStore = new ActiveProblemStore(storage, clock);
    ledger = new RawLedger(storage, clock);
    queue = new PendingQueue(storage, clock);
    bundler = new ObservationBundler(storage, clock);
    flowStore = new FlowGraphStore(storage, clock);
    flowGraphProjector = new FlowGraphProjector();
    claimStore = new ClaimStore(storage, clock);
    flowBlockToClaim = new FlowBlockToClaimCandidate(clock);
    await problemStore.create("test", "test");
  });

  const baseDeps = () => ({
    storage, clock, problemStore, ledger, queue, bundler,
    claimStore, flowBlockToClaim, flowGraphProjector, flowStore,
  });

  test("active problem에 confirmed Outcome (≥ 임계값) → claim 후보 1건 append", async () => {
    const active = (await problemStore.getActive())!;
    await bundler.openTurn("sess-claim-001", active.id, 1);
    await queue.enqueue({ type: "tool:Bash", data: { exitCode: 0 } }, "sess-claim-001");
    // FlowBlock 직접 ledger에 inject
    await flowStore.appendDelta(active.id, {
      op: "block-add", timestampIso: clock.isoNow(),
      block: makeOutcomeBlock("blk-out", 0.9, active.id),
    });

    await handleSessionEnd(makeSessionEnd(), baseDeps());

    const claims = await claimStore.list({ status: "pending" });
    expect(claims.length).toBeGreaterThanOrEqual(1);
    expect(claims[0]!.proposedType).toBe("outcome");
    expect(claims[0]!.candidateId).toBe("claim-cand-blk-out");
  });

  test("열린 turn 없음 → sealTurn null → claim detect 스킵", async () => {
    await handleSessionEnd(makeSessionEnd(), baseDeps());
    const claims = await claimStore.list();
    expect(claims).toHaveLength(0);
  });

  test("active problem 없음 (deps.problemStore.getActive() null) → claim detect 스킵", async () => {
    // 새 storage로 clean — active problem 없음
    const cleanStorage = new MemoryStorage();
    const cleanProblemStore = new ActiveProblemStore(cleanStorage, clock);
    const cleanFlowStore = new FlowGraphStore(cleanStorage, clock);
    const cleanClaimStore = new ClaimStore(cleanStorage, clock);

    await handleSessionEnd(makeSessionEnd(), {
      storage: cleanStorage, clock,
      problemStore: cleanProblemStore,
      ledger: new RawLedger(cleanStorage, clock),
      queue: new PendingQueue(cleanStorage, clock),
      bundler: new ObservationBundler(cleanStorage, clock),
      claimStore: cleanClaimStore,
      flowBlockToClaim,
      flowGraphProjector,
      flowStore: cleanFlowStore,
    });

    expect(await cleanClaimStore.list()).toHaveLength(0);
  });
});
