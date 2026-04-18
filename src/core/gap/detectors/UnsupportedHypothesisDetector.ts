import type { Detector } from "./Detector";
import type { FlowGraph } from "../../flow/types";
import type { GapCandidate } from "../types";
import type { Clock } from "../../clock/Clock";

export class UnsupportedHypothesisDetector implements Detector {
  readonly id = "rule:unsupported-hypothesis";
  readonly severity = 1.0;

  detect(graph: FlowGraph, _clock: Clock): GapCandidate[] {
    const evidencedTargets = new Set<string>();
    for (const b of graph.blocks) {
      for (const r of b.relations) {
        if (r.kind === "evidencedBy") evidencedTargets.add(r.targetBlockId);
      }
    }
    const gaps: GapCandidate[] = [];
    for (const h of graph.blocks) {
      if (h.type !== "Hypothesis" || h.status !== "confirmed") continue;
      if (!evidencedTargets.has(h.blockId)) {
        gaps.push({
          detectorId: "rule:unsupported-hypothesis",
          subjectBlockId: h.blockId,
          severity: this.severity,
          label: `가설 '${h.label}'에 뒷받침하는 근거가 없음`,
        });
      }
    }
    return gaps;
  }
}
