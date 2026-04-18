import type { Detector } from "./Detector";
import type { FlowGraph } from "../../flow/types";
import type { GapCandidate } from "../types";
import type { Clock } from "../../clock/Clock";

export class OrphanActionDetector implements Detector {
  readonly id = "rule:orphan-action";
  readonly severity = 0.7;

  detect(graph: FlowGraph, _clock: Clock): GapCandidate[] {
    const byId = new Map(graph.blocks.map((b) => [b.blockId, b]));
    const gaps: GapCandidate[] = [];
    for (const a of graph.blocks) {
      if (a.type !== "Action" || a.status !== "confirmed") continue;
      const hasConfirmedOutcome = a.relations.some((r) => {
        if (r.kind !== "followsFrom") return false;
        const target = byId.get(r.targetBlockId);
        return target?.type === "Outcome" && target.status === "confirmed";
      });
      if (!hasConfirmedOutcome) {
        gaps.push({
          detectorId: "rule:orphan-action",
          subjectBlockId: a.blockId,
          severity: this.severity,
          label: `행동 '${a.label}'의 결과가 관측되지 않음`,
        });
      }
    }
    return gaps;
  }
}
