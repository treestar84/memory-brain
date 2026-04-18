import type { Detector } from "./Detector";
import type { FlowGraph } from "../../flow/types";
import type { GapCandidate } from "../types";
import type { Clock } from "../../clock/Clock";

export class UnmitigatedCauseDetector implements Detector {
  readonly id = "rule:unmitigated-cause";
  readonly severity = 0.75;

  detect(graph: FlowGraph, _clock: Clock): GapCandidate[] {
    const byId = new Map(graph.blocks.map((b) => [b.blockId, b]));
    return graph.blocks
      .filter((c) => c.type === "Cause" && c.status === "confirmed")
      .filter((c) => {
        const mitigators = c.relations.filter((r) => {
          if (r.kind !== "mitigatedBy") return false;
          const t = byId.get(r.targetBlockId);
          return t?.type === "Action" && t.status === "confirmed";
        });
        return mitigators.length === 0;
      })
      .map((c) => ({
        detectorId: "rule:unmitigated-cause" as const,
        subjectBlockId: c.blockId,
        severity: this.severity,
        label: `원인 '${c.label}'에 대한 대응 행동이 없음`,
      }));
  }
}
