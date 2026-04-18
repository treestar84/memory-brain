import { FLOW_CONFIG } from "./config";
import type { FlowBlock, FlowDelta, FlowGraph } from "./types";
import type { Clock } from "../clock/Clock";
import type { Detector } from "../gap/detectors/Detector";
import type { VoiScorer } from "../gap/VoiScorer";
import type { QuestionLifecycleResolver } from "../gap/QuestionLifecycleResolver";
import { GapAnalyzer } from "../gap/GapAnalyzer";
import type { AskedRecord } from "../gap/types";

export class FlowGraphProjector {
  private readonly analyzer: GapAnalyzer;

  constructor(
    detectors: Detector[] = [],
    private readonly scorer?: VoiScorer,
    private readonly resolver?: QuestionLifecycleResolver,
  ) {
    this.analyzer = new GapAnalyzer(detectors);
  }

  project(
    problemId: string,
    deltas: FlowDelta[],
    asked: AskedRecord[] = [],
    clock?: Clock,
  ): FlowGraph {
    const base = this.fold(problemId, deltas);

    if (this.scorer && this.resolver && clock) {
      const structural = this.analyzer.analyze(base, clock);
      base.blocks.push(...structural);

      for (const b of base.blocks) {
        if (b.type === "Gap") {
          b.voiCached = this.scorer.score(b, base, clock);
        }
      }

      const lifecycles = this.resolver.resolve(base.blocks, asked, clock);
      for (const b of base.blocks) {
        if (b.type !== "Question") continue;
        const lc = lifecycles.get(b.blockId);
        if (lc) {
          b.lifecycle = lc.lifecycle;
          b.askedAt = lc.askedAt;
          b.answeredByBundleId = lc.answeredByBundleId;
          b.answerBlockId = lc.answerBlockId;
        }
        if (b.gapBlockId) {
          const gap = base.blocks.find((g) => g.blockId === b.gapBlockId);
          if (gap?.voiCached !== undefined) b.voiCached = gap.voiCached;
        }
      }
    }

    return base;
  }

  private fold(problemId: string, deltas: FlowDelta[]): FlowGraph {
    const blocks = new Map<string, FlowBlock>();
    let lastSyntheticAt: string | null = null;
    let bodyHash: string | null = null;
    let bodyBytes = 0;

    for (const d of deltas) {
      switch (d.op) {
        case "block-add":
          if (d.block.problemId === problemId) {
            blocks.set(d.block.blockId, { ...d.block, relations: [...d.block.relations] });
          }
          break;
        case "block-supersede": {
          if (d.problemId !== problemId) break;
          const b = blocks.get(d.blockId);
          if (b) {
            blocks.set(d.blockId, { ...b, status: "superseded", supersededBy: d.supersededBy });
          }
          break;
        }
        case "relation-add": {
          if (d.problemId !== problemId) break;
          const b = blocks.get(d.fromBlockId);
          if (b) {
            blocks.set(d.fromBlockId, { ...b, relations: [...b.relations, d.relation] });
          }
          break;
        }
        case "cue-card-regen":
          if (d.problemId === problemId) {
            lastSyntheticAt = d.timestampIso;
            bodyHash = d.bodyHash;
            bodyBytes = d.bodyBytes;
          }
          break;
      }
    }

    return {
      problemId,
      blocks: Array.from(blocks.values()),
      cueCardMeta: {
        lastSyntheticAt,
        bodyHash,
        bodyBytes,
        stale: deltas.length >= FLOW_CONFIG.DELTA_STALE_COUNT,
      },
    };
  }
}
