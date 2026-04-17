import type { CanonicalEvent } from "../core/events/CanonicalEvent";
import type { Storage } from "../core/storage/Storage";
import type { Clock } from "../core/clock/Clock";
import type { ActiveProblemStore } from "../core/binder/ActiveProblemStore";
import type { PendingQueue } from "../core/ledger/PendingQueue";
import type { RawLedger } from "../core/ledger/RawLedger";
import type { Expirer } from "../core/ledger/Expirer";

export type HookDeps = {
  storage: Storage;
  clock: Clock;
  problemStore: ActiveProblemStore;
  queue: PendingQueue;
  ledger: RawLedger;
  expirer: Expirer;
};

export async function handleSessionStart(
  event: CanonicalEvent,
  deps: HookDeps
): Promise<string> {
  await deps.ledger.append(event);
  await deps.expirer.sweep(deps.queue);

  const active = await deps.problemStore.getActive();
  const pendingCount = await deps.queue.count();

  const lines: string[] = ["### 🧠 memory-brain"];

  if (!active) {
    lines.push("초기화됨. `/cfgm-new-problem`으로 문제를 생성하세요.");
  } else {
    lines.push(`**문제:** ${active.title} (\`${active.slug}\`)`);
    lines.push(`확인: ${active.lastConfirmedAt}`);
  }

  if (pendingCount > 0) {
    lines.push(`**대기 분석:** ${pendingCount}건 → \`/cfgm-process\`로 처리`);
  }

  return lines.join("\n");
}
