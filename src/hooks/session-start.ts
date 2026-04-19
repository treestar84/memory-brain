import type { CanonicalEvent } from "../core/events/CanonicalEvent";
import type { Storage } from "../core/storage/Storage";
import type { Clock } from "../core/clock/Clock";
import type { ActiveProblemStore } from "../core/binder/ActiveProblemStore";
import type { PendingQueue } from "../core/ledger/PendingQueue";
import type { RawLedger } from "../core/ledger/RawLedger";
import type { Expirer } from "../core/ledger/Expirer";
import type { ObservationBundler } from "../core/flow/ObservationBundler";
import type { CueCardInjector } from "../core/flow/CueCardInjector";
import type { CueCardFallback } from "../core/flow/CueCardFallback";
import { FLOW_CONFIG } from "../core/flow/config";
import type { OntologyModule } from "../core/ontology/OntologyModule";

export type HookDeps = {
  storage: Storage;
  clock: Clock;
  problemStore: ActiveProblemStore;
  queue: PendingQueue;
  ledger: RawLedger;
  expirer: Expirer;
  bundler: ObservationBundler;
  injector: CueCardInjector;
  fallback: CueCardFallback;
  ontologyModule?: OntologyModule;
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

    if (deps.ontologyModule) {
      const moduleData = await deps.ontologyModule.read(active.id);
      if (moduleData) {
        lines.push(`**템플릿:** ${moduleData.templateId} v${moduleData.templateVersion}`);
        lines.push(`**완료 횟수:** ${moduleData.resolvedRuns} / 3`);
      }
    }

    const cueCardPath = `problems/${active.id}/cue-card.md`;
    let cueCardMd = await deps.storage.readText(cueCardPath);

    const unprocessedBundles = await deps.bundler.listUnprocessed(active.id);

    if (!cueCardMd && unprocessedBundles.length > 0) {
      cueCardMd = deps.fallback.generate(active.id, active.title, unprocessedBundles);
    }

    if (cueCardMd) {
      const budgetBytes = Math.floor(FLOW_CONFIG.STDOUT_INJECT_BUDGET_KB * 1024);
      const projected = deps.injector.projectForStdout(cueCardMd, budgetBytes);
      lines.push("");
      lines.push(projected);
    }

    if (unprocessedBundles.length >= FLOW_CONFIG.PENDING_WARN_THRESHOLD) {
      lines.push("");
      lines.push(`> 미처리 번들 ${unprocessedBundles.length}개 · \`/cfgm-process\` 권장`);
    }
  }

  if (pendingCount > 0) {
    lines.push(`**대기 분석:** ${pendingCount}건 → \`/cfgm-process\`로 처리`);
  }

  return lines.join("\n");
}
