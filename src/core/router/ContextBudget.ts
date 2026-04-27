import { CONTEXT_BUDGET_LIMITS, type BudgetCheckResult } from "./types";

export type BudgetSlot = "canonical" | "source" | "persona";

/**
 * 라우팅 제한 강제 (PR-V3.3, vision §6.4).
 *
 * 한 라우팅 결정 동안의 슬롯 사용 카운터.
 * - canonical (projects/concepts/decisions/.md): ≤ 3
 * - source (sources/*): ≤ 3
 * - persona (profile/representations): ≤ 2
 *
 * 인스턴스 1개 = 1 라우팅 사이클. reset() 또는 새 인스턴스로 다음 사이클.
 */
export class ContextBudget {
  private used: Record<BudgetSlot, number> = {
    canonical: 0,
    source: 0,
    persona: 0,
  };

  private readonly limits: Record<BudgetSlot, number> = {
    canonical: CONTEXT_BUDGET_LIMITS.CANONICAL_PAGES,
    source: CONTEXT_BUDGET_LIMITS.SOURCE_FILES_PER_REQUEST,
    persona: CONTEXT_BUDGET_LIMITS.PERSONA_FILES_PER_REQUEST,
  };

  check(slot: BudgetSlot): BudgetCheckResult {
    const used = this.used[slot];
    const limit = this.limits[slot];
    const allowed = used < limit;
    return {
      allowed,
      reason: allowed
        ? `${slot} ${used + 1}/${limit}`
        : `${slot} budget 초과 (${used}/${limit})`,
      used,
      limit,
    };
  }

  consume(slot: BudgetSlot): BudgetCheckResult {
    const result = this.check(slot);
    if (result.allowed) this.used[slot] += 1;
    return result;
  }

  reset(): void {
    this.used = { canonical: 0, source: 0, persona: 0 };
  }

  snapshot(): Record<BudgetSlot, { used: number; limit: number }> {
    return {
      canonical: { used: this.used.canonical, limit: this.limits.canonical },
      source: { used: this.used.source, limit: this.limits.source },
      persona: { used: this.used.persona, limit: this.limits.persona },
    };
  }
}
