import type { LaneSelectionResult, MemoryLane, RequestCategory } from "./types";

/**
 * 카테고리 → lane 정적 매핑 (PR-V3.3, vision §6.2).
 *
 * 다중 카테고리 → lane union. current 는 PROJECT/CODE 시 항상 포함.
 */

const CATEGORY_LANES: Record<RequestCategory, MemoryLane[]> = {
  QUICK: [],
  DEEP: ["concept", "decision", "persona"],
  PROJECT: ["current", "project"],
  PERSONAL: ["persona"],
  VERIFY: ["decision", "evidence"],
  WRITE: ["current", "concept", "decision"],
  CODE: ["current", "project", "code"],
  RESEARCH: ["research", "evidence"],
  CONFLICT: ["governance", "decision"],
  MAINTENANCE: ["governance"],
};

export class LaneSelector {
  select(categories: RequestCategory[]): LaneSelectionResult {
    const set = new Set<MemoryLane>();
    const reasons: string[] = [];

    for (const cat of categories) {
      const lanes = CATEGORY_LANES[cat];
      if (lanes.length === 0) {
        reasons.push(`${cat}: lane 불요`);
        continue;
      }
      for (const lane of lanes) set.add(lane);
      reasons.push(`${cat} → ${lanes.join(",")}`);
    }

    return {
      lanes: Array.from(set),
      reason: reasons.join(" | ") || "no lanes",
    };
  }
}
