import type { CanonicalEvent } from "../core/events/CanonicalEvent";
import type { Storage } from "../core/storage/Storage";
import type { Clock } from "../core/clock/Clock";
import type { ActiveProblemStore } from "../core/binder/ActiveProblemStore";
import type { PendingQueue } from "../core/ledger/PendingQueue";
import type { RawLedger } from "../core/ledger/RawLedger";
import type { ObservationBundler } from "../core/flow/ObservationBundler";
import type { QuestionQueue } from "../core/gap/QuestionQueue";
import type { AskedRecord } from "../core/gap/types";
import type { SettingsReader } from "../core/settings/SettingsReader";
import { FLOW_CONFIG } from "../core/flow/config";

export type PromptSubmitDeps = {
  storage: Storage;
  clock: Clock;
  problemStore: ActiveProblemStore;
  queue: PendingQueue;
  ledger: RawLedger;
  bundler: ObservationBundler;
  questionQueue?: QuestionQueue;
  settingsReader?: SettingsReader;
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
  deps: PromptSubmitDeps,
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

  const lines: string[] = [`### 🧠 memory-brain`, `**문제:** ${active.title}`];

  const pendingCount = await deps.queue.count();
  if (pendingCount > 0) {
    const peek = await deps.queue.peek();
    lines.push(`**대기 분석:** ${pendingCount}건 → "처리해줘"라고 말하면 됩니다.`);
    if (peek) {
      lines.push(`최우선: \`${peek.payload.type}\``);
    }
  }

  const question = await injectQuestion(event, deps, active.id, nextOrdinal);
  if (question) lines.push(question);

  return lines.join("\n");
}

async function injectQuestion(
  event: CanonicalEvent,
  deps: PromptSubmitDeps,
  activeProblemId: string,
  turnOrdinal: number,
): Promise<string | null> {
  const { questionQueue, storage, clock, settingsReader } = deps;
  if (!questionQueue) return null;

  const pending = await questionQueue.listPending();
  if (pending.length === 0) return null;

  const asked = await questionQueue.listAsked();
  const policy = settingsReader
    ? await settingsReader.getQuestionPolicy()
    : {
        cooldownMinutes: FLOW_CONFIG.QUESTION_POLICY.COOLDOWN_MINUTES,
        dailyCap: FLOW_CONFIG.QUESTION_POLICY.DAILY_CAP,
      };

  const today = clock.isoDate();
  const askedToday = asked.filter((a) => a.askedAtIso.slice(0, 10) === today).length;
  if (askedToday >= policy.dailyCap) return null;

  const latestByGap = new Map<string, AskedRecord>();
  for (const a of asked) {
    const prev = latestByGap.get(a.gapBlockId);
    if (!prev || a.askedAtIso > prev.askedAtIso) latestByGap.set(a.gapBlockId, a);
  }

  const askedQuestionIds = new Set(asked.map((a) => a.questionBlockId));
  const nowMs = clock.now().getTime();
  const cooldownMs = policy.cooldownMinutes * 60_000;

  for (const cand of pending) {
    if (cand.problemId !== activeProblemId) continue;
    if (askedQuestionIds.has(cand.questionBlockId)) continue;

    const last = latestByGap.get(cand.gapBlockId);
    if (last) {
      if (last.resolution) continue;
      const elapsed = nowMs - new Date(last.askedAtIso).getTime();
      if (elapsed < cooldownMs) continue;
    }

    const bytes = new TextEncoder().encode(cand.label).length;
    if (bytes > FLOW_CONFIG.QUESTION_LABEL_MAX_BYTES) {
      await storage.appendJsonl("security/hook-errors.jsonl", {
        kind: "question-oversized",
        questionBlockId: cand.questionBlockId,
        bytes,
        at: clock.isoNow(),
      });
      continue;
    }

    await questionQueue.appendAsked({
      questionBlockId: cand.questionBlockId,
      gapBlockId: cand.gapBlockId,
      problemId: cand.problemId,
      askedAtIso: clock.isoNow(),
      sessionId: event.sessionId,
      promptTurnOrdinal: turnOrdinal,
    });

    return `\n## 🧠 memory-brain — 확인 질문\n> ${cand.label}\n\n(답변은 다음 "처리해줘" 시점에 반영됩니다)`;
  }
  return null;
}

if (import.meta.main) {
  const { runHook } = await import("../adapters/claude-code/hook-runner");
  const { buildDeps } = await import("./bootstrap");
  const deps = buildDeps();
  await runHook(async (event) => handleUserPromptSubmit(event, deps));
}
