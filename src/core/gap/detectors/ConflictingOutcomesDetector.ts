import type { Detector } from "./Detector";
import type { FlowGraph } from "../../flow/types";
import type { GapCandidate } from "../types";
import type { Clock } from "../../clock/Clock";

export class ConflictingOutcomesDetector implements Detector {
  readonly id = "rule:conflicting-outcomes";
  readonly severity = 0.9;

  detect(graph: FlowGraph, _clock: Clock): GapCandidate[] {
    const byId = new Map(graph.blocks.map((b) => [b.blockId, b]));
    const gaps: GapCandidate[] = [];
    for (const action of graph.blocks) {
      if (action.type !== "Action" || action.status !== "confirmed") continue;
      const polarities = new Set<"+" | "-">();
      for (const r of action.relations) {
        if (r.kind !== "followsFrom") continue;
        const target = byId.get(r.targetBlockId);
        if (!target || target.type !== "Outcome" || target.status !== "confirmed") continue;
        if (target.polarity === "+" || target.polarity === "-") {
          polarities.add(target.polarity);
        }
      }
      if (polarities.has("+") && polarities.has("-")) {
        gaps.push({
          detectorId: "rule:conflicting-outcomes",
          subjectBlockId: action.blockId,
          severity: this.severity,
          label: `행동 '${action.label}'의 결과가 모순됨(양성/음성 공존)`,
        });
      }
    }
    return gaps;
  }
}
