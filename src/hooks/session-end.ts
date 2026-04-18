import type { CanonicalEvent } from "../core/events/CanonicalEvent";
import type { Storage } from "../core/storage/Storage";
import type { Clock } from "../core/clock/Clock";
import type { ActiveProblemStore } from "../core/binder/ActiveProblemStore";
import type { RawLedger } from "../core/ledger/RawLedger";
import type { PendingQueue } from "../core/ledger/PendingQueue";
import type { ObservationBundler } from "../core/flow/ObservationBundler";

export type SessionEndDeps = {
  storage: Storage;
  clock: Clock;
  problemStore: ActiveProblemStore;
  ledger: RawLedger;
  queue: PendingQueue;
  bundler: ObservationBundler;
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
    await deps.bundler.sealTurn(event.sessionId, observations, []);
  }

  await deps.problemStore.updateLastConfirmed();
  return null;
}
