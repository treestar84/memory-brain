import type { Detector } from "./detectors/Detector";
import type { FlowGraph, FlowBlock } from "../flow/types";
import type { Clock } from "../clock/Clock";
import type { GapCandidate } from "./types";

type Options = { onError?: (err: unknown, detectorId: string) => void };

export class GapAnalyzer {
  constructor(
    private readonly detectors: Detector[],
    private readonly options: Options = {},
  ) {}

  analyze(graph: FlowGraph, clock: Clock): FlowBlock[] {
    const seen = new Set<string>();
    const result: FlowBlock[] = [];
    for (const detector of this.detectors) {
      let candidates: GapCandidate[];
      try {
        candidates = detector.detect(graph, clock);
      } catch (e) {
        this.options.onError?.(e, detector.id);
        continue;
      }
      for (const c of candidates) {
        const blockId = `gap:${c.detectorId}:${c.subjectBlockId}`;
        if (seen.has(blockId)) continue;
        seen.add(blockId);
        const subject = graph.blocks.find((b) => b.blockId === c.subjectBlockId);
        result.push({
          blockId,
          problemId: subject?.problemId ?? graph.problemId,
          type: "Gap",
          status: "confirmed",
          label: c.label,
          confidence: 1.0,
          supportedBy: [],
          relations: [],
          createdAt: clock.isoNow(),
          lastConfirmedAt: clock.isoNow(),
          staleAfter: null,
          supersededBy: null,
          bundleId: "",
          detectorId: c.detectorId,
          subject: { blockId: c.subjectBlockId },
          severity: c.severity,
        });
      }
    }
    return result;
  }
}
