import type { Clock } from "../clock/Clock";
import type { FlowGraph } from "../flow/types";
import type { ClaimCandidate } from "./types";

export const CLAIM_CONFIDENCE_THRESHOLD = 0.7;
export const RULE_OUTCOME_PROMOTE = "outcome-confidence-promote";
export const RULE_RULE_PROMOTE = "rule-confidence-promote";

export class FlowBlockToClaimCandidate {
  constructor(private readonly clock: Clock) {}

  detect(graph: FlowGraph): ClaimCandidate[] {
    const candidates: ClaimCandidate[] = [];
    const now = this.clock.isoNow();
    for (const block of graph.blocks) {
      if (block.status !== "confirmed") continue;
      if (block.type !== "Outcome" && block.type !== "Rule") continue;
      if (block.confidence < CLAIM_CONFIDENCE_THRESHOLD) continue;

      const isOutcome = block.type === "Outcome";
      candidates.push({
        candidateId: `claim-cand-${block.blockId}`,
        bundleId: block.bundleId,
        blockId: block.blockId,
        proposedType: isOutcome ? "outcome" : "rule",
        proposedText: block.label,
        detectedBy: isOutcome ? RULE_OUTCOME_PROMOTE : RULE_RULE_PROMOTE,
        confidence: block.confidence,
        evidence: [
          {
            source: `flow-delta:${block.bundleId}:${block.blockId}`,
            quote: block.label,
          },
        ],
        status: "pending",
        createdAt: now,
        decidedAt: null,
        decidedBy: null,
        reason: null,
      });
    }
    return candidates;
  }
}
