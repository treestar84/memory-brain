import type { CanonicalEvent } from "../core/events/CanonicalEvent";
import type { Storage } from "../core/storage/Storage";
import type { Clock } from "../core/clock/Clock";
import type { RawLedger } from "../core/ledger/RawLedger";
import type { PendingQueue } from "../core/ledger/PendingQueue";
import type { ObservationNormalizer } from "../core/normalizer/ObservationNormalizer";

export type PostToolDeps = {
  storage: Storage;
  clock: Clock;
  ledger: RawLedger;
  queue: PendingQueue;
  normalizer: ObservationNormalizer;
};

export async function handlePostToolUse(
  event: CanonicalEvent,
  deps: PostToolDeps
): Promise<string | null> {
  await deps.ledger.append(event);

  const observation = await deps.normalizer.normalize(event);
  if (!observation) return null;

  if (observation.needsAnalysis) {
    await deps.queue.enqueue(
      {
        type: observation.type,
        data: observation.data,
      },
      event.sessionId
    );
  }

  return null;
}
