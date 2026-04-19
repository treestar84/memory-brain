import type { FlowGraphStore } from "../flow/FlowGraphStore";
import type { Clock } from "../clock/Clock";
import { GOVERNANCE_CONFIG } from "./config";

export class StaleDecayEngine {
  constructor(
    private readonly flowStore: FlowGraphStore,
    private readonly clock: Clock,
  ) {}

  /**
   * 주어진 problemId의 스냅샷에서 staleAfter가 지난 confirmed 블록을 찾아
   * superseded로 변경하고 flow-delta에 기록한다.
   * @returns 실제로 supersede된 blockId 목록
   */
  async sweep(problemId: string): Promise<string[]> {
    const snapshot = await this.flowStore.readSnapshot(problemId);
    if (!snapshot) return [];

    const now = this.clock.isoNow();
    const nowMs = new Date(now).getTime() + GOVERNANCE_CONFIG.DECAY_GRACE_MS;
    const decayed: string[] = [];

    for (const block of snapshot.blocks) {
      if (block.status !== "confirmed") continue;
      if (!block.staleAfter) continue;
      if (new Date(block.staleAfter).getTime() > nowMs) continue;

      block.status = "superseded";
      block.supersededBy = GOVERNANCE_CONFIG.DECAY_REASON;
      decayed.push(block.blockId);

      await this.flowStore.appendDelta(problemId, {
        op: "block-supersede",
        timestampIso: now,
        problemId,
        blockId: block.blockId,
        supersededBy: GOVERNANCE_CONFIG.DECAY_REASON,
        reason: GOVERNANCE_CONFIG.DECAY_REASON,
      });
    }

    if (decayed.length > 0) {
      snapshot.cueCardMeta.stale = true;
      await this.flowStore.writeSnapshot(problemId, snapshot);
    }

    return decayed;
  }
}
