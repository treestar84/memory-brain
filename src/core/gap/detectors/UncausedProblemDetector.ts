import type { Detector } from "./Detector";
import type { FlowGraph } from "../../flow/types";
import type { GapCandidate } from "../types";
import type { Clock } from "../../clock/Clock";

export class UncausedProblemDetector implements Detector {
  readonly id = "rule:uncaused-problem";
  readonly severity = 0.85;

  detect(graph: FlowGraph, _clock: Clock): GapCandidate[] {
    const causesTargets = new Set<string>();
    for (const b of graph.blocks) {
      for (const r of b.relations) {
        if (r.kind === "causes") causesTargets.add(r.targetBlockId);
      }
    }
    const gaps: GapCandidate[] = [];
    for (const p of graph.blocks) {
      if (p.type !== "Problem" || p.status !== "confirmed") continue;
      if (!causesTargets.has(p.blockId)) {
        gaps.push({
          detectorId: "rule:uncaused-problem",
          subjectBlockId: p.blockId,
          severity: this.severity,
          label: `문제 '${p.label}'의 원인이 식별되지 않음`,
        });
      }
    }
    return gaps;
  }
}
