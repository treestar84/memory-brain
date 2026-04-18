import type { FlowGraph, FlowBlock } from "../flow/types";
import type { Clock } from "../clock/Clock";
import { FLOW_CONFIG } from "../flow/config";

const DAY_MS = 24 * 60 * 60 * 1000;

export class VoiScorer {
  score(gap: FlowBlock, graph: FlowGraph, clock: Clock): number {
    if (gap.type !== "Gap") return 0;

    const w = FLOW_CONFIG.VOI_WEIGHTS;
    const subject = gap.subject
      ? graph.blocks.find((b) => b.blockId === gap.subject!.blockId)
      : undefined;

    const severity = clamp01(gap.severity ?? 0);
    const centrality = this.centrality(subject, graph);
    const recency = this.recency(subject ?? gap, clock);
    const confidenceGap = subject ? clamp01(1 - subject.confidence) : 0.5;
    const semanticBoost = clamp01(gap.semanticBoost ?? 0);

    const voi =
      w.severity * severity +
      w.centrality * centrality +
      w.recency * recency +
      w.confidenceGap * confidenceGap +
      w.semanticBoost * semanticBoost;
    return clamp01(voi);
  }

  private centrality(subject: FlowBlock | undefined, graph: FlowGraph): number {
    if (!subject) return 0;
    const outDegree = subject.relations.length;
    const inDegree = graph.blocks.reduce(
      (acc, b) => acc + b.relations.filter((r) => r.targetBlockId === subject.blockId).length,
      0,
    );
    const degrees = graph.blocks.map((b) => b.relations.length);
    const avg =
      degrees.length === 0 ? 0 : degrees.reduce((a, b) => a + b, 0) / degrees.length;
    if (avg === 0) return 0;
    return clamp01((inDegree + outDegree) / (avg * 2));
  }

  private recency(ref: FlowBlock, clock: Clock): number {
    const last = ref.lastConfirmedAt ?? ref.createdAt;
    const lastMs = new Date(last).getTime();
    const nowMs = clock.now().getTime();
    const days = Math.max(0, (nowMs - lastMs) / DAY_MS);
    return 1 / (1 + days);
  }
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
