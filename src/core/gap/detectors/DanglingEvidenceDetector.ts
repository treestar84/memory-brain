import type { Detector } from "./Detector";
import type { FlowGraph } from "../../flow/types";
import type { GapCandidate } from "../types";
import type { Clock } from "../../clock/Clock";

export class DanglingEvidenceDetector implements Detector {
  readonly id = "rule:dangling-evidence";
  readonly severity = 0.4;

  detect(graph: FlowGraph, _clock: Clock): GapCandidate[] {
    const referenced = new Set<string>();
    for (const b of graph.blocks) {
      for (const r of b.relations) {
        if (r.kind === "evidencedBy" || r.kind === "validatedBy") {
          referenced.add(r.targetBlockId);
        }
      }
    }
    const gaps: GapCandidate[] = [];
    for (const e of graph.blocks) {
      if (e.type !== "Evidence" || e.status !== "confirmed") continue;
      if (!referenced.has(e.blockId)) {
        gaps.push({
          detectorId: "rule:dangling-evidence",
          subjectBlockId: e.blockId,
          severity: this.severity,
          label: `근거 '${e.label}'가 어디에도 연결되지 않음`,
        });
      }
    }
    return gaps;
  }
}
