import { FLOW_CONFIG } from "./config";
import type { FlowBlock, FlowDelta, FlowGraph } from "./types";

export class FlowGraphProjector {
  project(problemId: string, deltas: FlowDelta[]): FlowGraph {
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
