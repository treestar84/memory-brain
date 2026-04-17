import type { CanonicalEvent } from "../core/events/CanonicalEvent";
import type { Storage } from "../core/storage/Storage";
import type { Clock } from "../core/clock/Clock";
import type { ActiveProblemStore } from "../core/binder/ActiveProblemStore";
import type { PendingQueue } from "../core/ledger/PendingQueue";
import type { RawLedger } from "../core/ledger/RawLedger";

export type PromptSubmitDeps = {
  storage: Storage;
  clock: Clock;
  problemStore: ActiveProblemStore;
  queue: PendingQueue;
  ledger: RawLedger;
};

export async function handleUserPromptSubmit(
  event: CanonicalEvent,
  deps: PromptSubmitDeps
): Promise<string | null> {
  await deps.ledger.append(event);

  const active = await deps.problemStore.getActive();
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
