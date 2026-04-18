import type { FlowBlock } from "../flow/types";
import type { Clock } from "../clock/Clock";
import { FLOW_CONFIG } from "../flow/config";
import type { AskedRecord, QuestionLifecycle } from "./types";

export type LifecycleFields = {
  lifecycle: QuestionLifecycle;
  askedAt: string | null;
  answeredByBundleId: string | null;
  answerBlockId: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export class QuestionLifecycleResolver {
  resolve(
    blocks: FlowBlock[],
    asked: AskedRecord[],
    clock: Clock,
  ): Map<string, LifecycleFields> {
    const byId = new Map(blocks.map((b) => [b.blockId, b]));
    const earliestAsked = new Map<string, AskedRecord>();
    for (const rec of asked) {
      const prev = earliestAsked.get(rec.questionBlockId);
      if (!prev || rec.askedAtIso < prev.askedAtIso) {
        earliestAsked.set(rec.questionBlockId, rec);
      }
    }

    const nowMs = clock.now().getTime();
    const staleMs = FLOW_CONFIG.QUESTION_PENDING_STALE_DAYS * DAY_MS;
    const result = new Map<string, LifecycleFields>();

    for (const q of blocks) {
      if (q.type !== "Question") continue;

      if (q.status === "superseded" && q.supersededBy !== null) {
        const answer = byId.get(q.supersededBy);
        result.set(q.blockId, {
          lifecycle: "answered",
          askedAt: earliestAsked.get(q.blockId)?.askedAtIso ?? null,
          answeredByBundleId: answer?.bundleId ?? null,
          answerBlockId: q.supersededBy,
        });
        continue;
      }

      const gapExists = q.gapBlockId ? byId.has(q.gapBlockId) : false;
      if (!gapExists) {
        result.set(q.blockId, {
          lifecycle: "stale",
          askedAt: earliestAsked.get(q.blockId)?.askedAtIso ?? null,
          answeredByBundleId: null,
          answerBlockId: null,
        });
        continue;
      }

      const createdMs = new Date(q.createdAt).getTime();
      if (nowMs - createdMs > staleMs) {
        result.set(q.blockId, {
          lifecycle: "stale",
          askedAt: earliestAsked.get(q.blockId)?.askedAtIso ?? null,
          answeredByBundleId: null,
          answerBlockId: null,
        });
        continue;
      }

      const askedRec = earliestAsked.get(q.blockId);
      if (askedRec) {
        result.set(q.blockId, {
          lifecycle: "asked",
          askedAt: askedRec.askedAtIso,
          answeredByBundleId: null,
          answerBlockId: null,
        });
        continue;
      }

      result.set(q.blockId, {
        lifecycle: "pending",
        askedAt: null,
        answeredByBundleId: null,
        answerBlockId: null,
      });
    }
    return result;
  }
}
