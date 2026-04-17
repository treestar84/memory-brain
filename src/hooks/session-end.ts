import type { CanonicalEvent } from "../core/events/CanonicalEvent";
import type { Storage } from "../core/storage/Storage";
import type { Clock } from "../core/clock/Clock";
import type { ActiveProblemStore } from "../core/binder/ActiveProblemStore";
import type { RawLedger } from "../core/ledger/RawLedger";
import type { PendingQueue } from "../core/ledger/PendingQueue";

export type SessionEndDeps = {
  storage: Storage;
  clock: Clock;
  problemStore: ActiveProblemStore;
  ledger: RawLedger;
  queue: PendingQueue;
};

export async function handleSessionEnd(
  event: CanonicalEvent,
  deps: SessionEndDeps
): Promise<string | null> {
  await deps.ledger.append(event);
  await deps.problemStore.updateLastConfirmed();
  return null;
}
