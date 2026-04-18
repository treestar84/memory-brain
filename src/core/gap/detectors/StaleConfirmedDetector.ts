import type { Detector } from "./Detector";
import type { FlowGraph } from "../../flow/types";
import type { GapCandidate } from "../types";
import type { Clock } from "../../clock/Clock";
import { FLOW_CONFIG } from "../../flow/config";

export class StaleConfirmedDetector implements Detector {
  readonly id = "rule:stale-confirmed";
  readonly severity = 0.6;

  detect(graph: FlowGraph, clock: Clock): GapCandidate[] {
    const STALE_MS = FLOW_CONFIG.DEFAULT_STALE_DAYS * 24 * 60 * 60 * 1000;
    const now = clock.now().getTime();
    const gaps: GapCandidate[] = [];
    for (const b of graph.blocks) {
      if (b.status !== "confirmed") continue;
      if (b.type === "Gap" || b.type === "Question") continue;
      if (b.lastConfirmedAt === null) continue;

      let stale = false;
      let days = 0;
      if (b.staleAfter !== null) {
        const staleAt = new Date(b.staleAfter).getTime();
        if (now > staleAt) {
          stale = true;
          days = Math.floor((now - new Date(b.lastConfirmedAt).getTime()) / (24 * 60 * 60 * 1000));
        }
      } else {
        const lastMs = new Date(b.lastConfirmedAt).getTime();
        if (now - lastMs > STALE_MS) {
          stale = true;
          days = Math.floor((now - lastMs) / (24 * 60 * 60 * 1000));
        }
      }

      if (stale) {
        gaps.push({
          detectorId: "rule:stale-confirmed",
          subjectBlockId: b.blockId,
          severity: this.severity,
          label: `'${b.label}'의 마지막 확인이 ${days}일 지남`,
          extra: { days },
        });
      }
    }
    return gaps;
  }
}
