import type { Detector } from "./Detector";
import type { FlowGraph } from "../../flow/types";
import type { GapCandidate } from "../types";
import type { Clock } from "../../clock/Clock";

const CRITICAL_TYPES = new Set(["Hypothesis", "Cause", "Outcome"]);

export class LowConfidenceCriticalDetector implements Detector {
  readonly id = "rule:low-confidence-critical";
  readonly severity = 0.5;

  detect(graph: FlowGraph, _clock: Clock): GapCandidate[] {
    const gaps: GapCandidate[] = [];
    for (const b of graph.blocks) {
      if (b.status !== "confirmed") continue;
      if (!CRITICAL_TYPES.has(b.type)) continue;
      if (b.confidence >= 0.5) continue;
      gaps.push({
        detectorId: "rule:low-confidence-critical",
        subjectBlockId: b.blockId,
        severity: this.severity,
        label: `'${b.label}'의 신뢰도 ${b.confidence.toFixed(2)}가 낮음`,
      });
    }
    return gaps;
  }
}
