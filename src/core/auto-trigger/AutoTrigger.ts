import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";

const STATE_PATH = "state/auto-trigger.json";

export const DEFAULT_TRIGGER_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface TriggerDefinition {
  id: string;
  message: string;
}

export const KNOWN_TRIGGERS: readonly TriggerDefinition[] = [
  {
    id: "governance",
    message: "📊 governance report 갱신 — `bun run bin/cfgm-governance-report.ts`",
  },
  {
    id: "search-index",
    message: "🔍 search index 갱신 — `bun run bin/cfgm-rebuild-index.ts`",
  },
] as const;

interface TriggerState {
  lastRun: Record<string, string>;
}

/**
 * 자동 갱신 nudge 모듈 (post PR-V3.8).
 *
 * **자동 실행 안 함** — 24h 미실행 trigger 에 대해 nudge 메시지만 생성.
 * 사용자가 명시 호출하거나 Claude 본체가 자연 흐름으로 호출.
 *
 * 자동 실행은 후속 ADR (안정성·비용 검증 후). ADR-011 자가 호출 정신
 * 답습 — Claude 본체가 nudge 보고 호출 결정.
 */
export class AutoTrigger {
  constructor(private readonly storage: Storage, private readonly clock: Clock) {}

  async shouldRun(triggerId: string, intervalMs: number = DEFAULT_TRIGGER_INTERVAL_MS): Promise<boolean> {
    const state = await this.readState();
    const lastIso = state.lastRun[triggerId];
    if (!lastIso) return true;
    const last = Date.parse(lastIso);
    const now = this.clock.now().getTime();
    return now - last >= intervalMs;
  }

  async markRun(triggerId: string): Promise<void> {
    const state = await this.readState();
    state.lastRun[triggerId] = this.clock.isoNow();
    await this.storage.writeJsonAtomic(STATE_PATH, state);
  }

  async getNudges(intervalMs: number = DEFAULT_TRIGGER_INTERVAL_MS): Promise<string[]> {
    const nudges: string[] = [];
    for (const t of KNOWN_TRIGGERS) {
      if (await this.shouldRun(t.id, intervalMs)) nudges.push(t.message);
    }
    return nudges;
  }

  async getLastRun(triggerId: string): Promise<string | null> {
    const state = await this.readState();
    return state.lastRun[triggerId] ?? null;
  }

  private async readState(): Promise<TriggerState> {
    const raw = await this.storage.readJson<TriggerState>(STATE_PATH);
    if (!raw || typeof raw.lastRun !== "object" || raw.lastRun === null) {
      return { lastRun: {} };
    }
    return raw;
  }
}
