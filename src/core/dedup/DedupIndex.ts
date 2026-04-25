import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import type { FlowGraphStore } from "../flow/FlowGraphStore";
import type { FlowBlockType } from "../flow/types";
import { ContentHasher } from "./ContentHasher";

export type DedupSkipReason = "duplicate-type-label";

export interface DedupSkipEntry {
  problemId: string;
  hash: string;
  attemptedBlockId: string;
  type: FlowBlockType;
  reason: DedupSkipReason;
}

const SKIP_LOG_PATH = "security/dedup-skip.jsonl";

export class DedupIndex {
  constructor(
    private readonly store: FlowGraphStore,
    private readonly storage: Storage,
    private readonly clock: Clock,
    private readonly hasher: ContentHasher,
  ) {}

  async has(problemId: string, type: FlowBlockType, label: string): Promise<boolean> {
    const target = this.hasher.hash(type, label);
    const deltas = await this.store.readDeltas(problemId);
    const supersededIds = new Set<string>();
    for (const d of deltas) {
      if (d.op === "block-supersede") supersededIds.add(d.blockId);
    }
    for (const d of deltas) {
      if (d.op !== "block-add") continue;
      if (supersededIds.has(d.block.blockId)) continue;
      if (this.hasher.hash(d.block.type, d.block.label) === target) return true;
    }
    return false;
  }

  async logSkip(entry: DedupSkipEntry): Promise<void> {
    try {
      await this.storage.appendJsonl(SKIP_LOG_PATH, {
        ...entry,
        at: this.clock.isoNow(),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`dedup skip-log failed (non-fatal): ${msg}`);
    }
  }
}
