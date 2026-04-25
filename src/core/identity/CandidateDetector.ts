import { randomUUID } from "node:crypto";
import type { Clock } from "../clock/Clock";
import type { ObservationBundle } from "../flow/types";
import type { PromotedCandidate } from "./types";

export const HIGH_TOOL_CALL_THRESHOLD = 5;
export const RULE_HIGH_TOOL_CALL = "high-tool-call-pattern";

export class CandidateDetector {
  constructor(private readonly clock: Clock) {}

  detect(bundle: ObservationBundle): PromotedCandidate[] {
    const out: PromotedCandidate[] = [];
    const counts = bundle.metrics?.toolCallCounts ?? {};
    const now = this.clock.isoNow();
    for (const [toolName, count] of Object.entries(counts)) {
      if (typeof count !== "number") continue;
      if (count < HIGH_TOOL_CALL_THRESHOLD) continue;
      out.push({
        candidateId: randomUUID(),
        bundleId: bundle.bundleId,
        proposedTarget: "tools",
        proposedLabel: `tool 사용 패턴: ${toolName} (${count}회)`,
        detectedBy: RULE_HIGH_TOOL_CALL,
        metrics: { toolCallCount: count },
        status: "pending",
        createdAt: now,
        decidedAt: null,
        decidedBy: null,
        reason: null,
      });
    }
    return out;
  }
}
