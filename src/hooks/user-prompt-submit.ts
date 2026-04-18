import type { CanonicalEvent } from "../core/events/CanonicalEvent";
import type { Storage } from "../core/storage/Storage";
import type { Clock } from "../core/clock/Clock";
import type { ActiveProblemStore } from "../core/binder/ActiveProblemStore";
import type { PendingQueue } from "../core/ledger/PendingQueue";
import type { RawLedger } from "../core/ledger/RawLedger";
import type { ObservationBundler } from "../core/flow/ObservationBundler";

export type PromptSubmitDeps = {
  storage: Storage;
  clock: Clock;
  problemStore: ActiveProblemStore;
  queue: PendingQueue;
  ledger: RawLedger;
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

export async function handleUserPromptSubmit(
  event: CanonicalEvent,
  deps: PromptSubmitDeps
): Promise<string | null> {
  await deps.ledger.append(event);

  const active = await deps.problemStore.getActive();

  const turnStatePath = `state/current-turn-${event.sessionId}.json`;
  const state = await deps.storage.readJson<CurrentTurnState>(turnStatePath);

  if (state && state.sessionId && !state.closed) {
    const drained = await deps.queue.drainForSession(event.sessionId);
    const observations = drained.map((p) => ({ type: p.payload.type, data: p.payload.data }));
    await deps.bundler.sealTurn(event.sessionId, observations, []);
  }

  const nextOrdinal = (state?.turnOrdinal ?? 0) + 1;
  await deps.bundler.openTurn(event.sessionId, active?.id ?? null, nextOrdinal);

  if (!active) return null;

  const lines: string[] = [
    `### 🧠 memory-brain`,
    `**문제:** ${active.title}`,
  ];

  const pendingCount = await deps.queue.count();
  if (pendingCount > 0) {
    const peek = await deps.queue.peek();
    lines.push(`**대기 분석:** ${pendingCount}건`);
    if (peek) {
      lines.push(`최우선: \`${peek.payload.type}\``);
    }
  }

  return lines.join("\n");
}
