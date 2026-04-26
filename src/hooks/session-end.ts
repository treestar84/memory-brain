import type { CanonicalEvent } from "../core/events/CanonicalEvent";
import type { Storage } from "../core/storage/Storage";
import type { Clock } from "../core/clock/Clock";
import type { ActiveProblemStore } from "../core/binder/ActiveProblemStore";
import type { RawLedger } from "../core/ledger/RawLedger";
import type { PendingQueue } from "../core/ledger/PendingQueue";
import type { ObservationBundler } from "../core/flow/ObservationBundler";
import type { PromotionLedger } from "../core/identity/PromotionLedger";
import type { CandidateDetector } from "../core/identity/CandidateDetector";
import type { ClaimStore } from "../core/claim/ClaimStore";
import type { FlowBlockToClaimCandidate } from "../core/claim/FlowBlockToClaimCandidate";
import type { FlowGraphProjector } from "../core/flow/FlowGraphProjector";
import type { FlowGraphStore } from "../core/flow/FlowGraphStore";

export type SessionEndDeps = {
  storage: Storage;
  clock: Clock;
  problemStore: ActiveProblemStore;
  ledger: RawLedger;
  queue: PendingQueue;
  bundler: ObservationBundler;
  promotionLedger?: PromotionLedger;
  candidateDetector?: CandidateDetector;
  claimStore?: ClaimStore;
  flowBlockToClaim?: FlowBlockToClaimCandidate;
  flowGraphProjector?: FlowGraphProjector;
  flowStore?: FlowGraphStore;
};

type CurrentTurnState = {
  sessionId?: string;
  activeProblemId?: string | null;
  turnOrdinal?: number;
  openedAt?: string;
  closed?: boolean;
  sealedAt?: string;
};

export async function handleSessionEnd(
  event: CanonicalEvent,
  deps: SessionEndDeps
): Promise<string | null> {
  await deps.ledger.append(event);

  const turnStatePath = `state/current-turn-${event.sessionId}.json`;
  const state = await deps.storage.readJson<CurrentTurnState>(turnStatePath);
  if (state && state.sessionId && !state.closed) {
    const drained = await deps.queue.drainForSession(event.sessionId);
    const observations = drained.map((p) => ({ type: p.payload.type, data: p.payload.data }));
    const sealed = await deps.bundler.sealTurn(event.sessionId, observations, []);
    if (sealed && deps.candidateDetector && deps.promotionLedger) {
      const candidates = deps.candidateDetector.detect(sealed);
      for (const c of candidates) await deps.promotionLedger.append(c);
    }
    if (sealed && deps.claimStore && deps.flowBlockToClaim && deps.flowGraphProjector && deps.flowStore) {
      const active = await deps.problemStore.getActive();
      if (active) {
        const deltas = await deps.flowStore.readDeltas(active.id);
        const graph = deps.flowGraphProjector.project(active.id, deltas);
        const claimCandidates = deps.flowBlockToClaim.detect(graph);
        for (const c of claimCandidates) await deps.claimStore.append(c);
      }
    }
  }

  await deps.problemStore.updateLastConfirmed();
  return null;
}

if (import.meta.main) {
  const { runHook } = await import("../adapters/claude-code/hook-runner");
  const { buildDeps } = await import("./bootstrap");
  const deps = buildDeps();
  await runHook(async (event) => handleSessionEnd(event, deps));
}
