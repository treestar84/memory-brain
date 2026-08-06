import { resolve, dirname } from "node:path";
import { mkdir } from "node:fs/promises";
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
import { enqueueSource, type EnqueueSourceOptions, type EnqueueResult } from "../core/capture/CaptureEnqueuer";

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
  /** capture 큐 (jobs/sources) 를 쓸 절대 경로 — 없으면 자동 capture 를 skip 한다. */
  storageRoot?: string;
  /** 테스트/DI 용 — 기본은 CaptureEnqueuer.enqueueSource. */
  captureEnqueue?: (opts: EnqueueSourceOptions) => Promise<EnqueueResult>;
};

const AUTO_CAPTURE_MIN_DEFAULT = 3;
const AUTO_CAPTURE_MAX_BYTES = 32 * 1024;

function safeStringify(data: unknown): string {
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

export function truncateToBytes(text: string, maxBytes: number): string {
  const bytes = Buffer.byteLength(text, "utf-8");
  if (bytes <= maxBytes) return text;
  const marker = "\n\n(truncated)\n";
  const markerBytes = Buffer.byteLength(marker, "utf-8");
  const budget = Math.max(maxBytes - markerBytes, 0);
  // 멀티바이트(한글 등) 문자 경계에서 자르면 Buffer→string 변환이 마지막에
  // U+FFFD(모지바케)를 남긴다 — 잘린 불완전 시퀀스를 제거해 바이트 예산은
  // 그대로 지키면서(문자만 줄어듦) 깨진 문자가 노출되지 않게 한다.
  const truncated = Buffer.from(text, "utf-8")
    .subarray(0, budget)
    .toString("utf-8")
    .replace(/�+$/, "");
  return truncated + marker;
}

function buildSessionSourceMarkdown(
  event: CanonicalEvent,
  observations: Array<{ type: string; data: unknown }>,
  endedAtIso: string,
): string {
  const lines: string[] = [
    `# 세션 관찰 기록 — ${event.sessionId}`,
    ``,
    `- session_id: ${event.sessionId}`,
    `- ended_at: ${endedAtIso}`,
    `- observation_count: ${observations.length}`,
    ``,
    `## Observations`,
    ``,
  ];
  observations.forEach((obs, i) => {
    lines.push(`### ${i + 1}. ${obs.type}`, ``, "```json", safeStringify(obs.data), "```", ``);
  });
  return truncateToBytes(lines.join("\n"), AUTO_CAPTURE_MAX_BYTES);
}

async function maybeAutoCapture(
  event: CanonicalEvent,
  deps: SessionEndDeps,
  observations: Array<{ type: string; data: unknown }>,
): Promise<void> {
  if (process.env.CFGM_AUTO_CAPTURE === "0") return;
  if (!deps.storageRoot) return;

  const min = Number(process.env.CFGM_AUTO_CAPTURE_MIN ?? AUTO_CAPTURE_MIN_DEFAULT);
  if (!Number.isFinite(min) || observations.length < min) return;

  const endedAtIso = deps.clock.isoNow();
  const sourceMarkdown = buildSessionSourceMarkdown(event, observations, endedAtIso);
  const sourceRelPath = `_pending/capture/sources/session-${event.sessionId}.md`;
  const sourceAbsPath = resolve(deps.storageRoot, sourceRelPath);

  await mkdir(dirname(sourceAbsPath), { recursive: true });
  await Bun.write(sourceAbsPath, sourceMarkdown);

  const jobsDir = resolve(deps.storageRoot, "_pending/capture/jobs");
  const enqueue = deps.captureEnqueue ?? enqueueSource;

  await enqueue({
    sourcePath: sourceRelPath,
    sourceText: sourceMarkdown,
    jobsDir,
    draftsDir: "_pending/capture/drafts",
    specDir: "memory/_pending/capture/_spec",
    now: new Date(endedAtIso),
    extraNote:
      "_spec 은 memory-brain 저장소의 memory/_pending/capture/_spec/prompt.md 를 참조하세요 (본 job 은 storage 큐이며 repo 큐와 별도입니다).",
  });
}

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
    if (sealed) {
      try {
        await maybeAutoCapture(event, deps, observations);
      } catch {
        // 자동 capture 실패는 session-end 를 절대 깨지 않는다 — 조용히 skip.
      }
    }
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
