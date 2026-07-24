import type { Storage } from "../storage/Storage";

const LOG_PATH = "stats/usage.jsonl";
const DEFAULT_DAYS = 7;

export type UsageTool = "search" | "ask";

export interface UsageEntry {
  tool: UsageTool;
  query: string;
  hits: number;
  topPageIds: string[];
  ts: string;
  /** 전달한 근거 번들/스니펫의 추정 토큰 수 (chars/4). 구형 라인엔 없을 수 있음 — 0 취급. */
  contextTokens?: number;
}

export interface UsageDayCount {
  date: string; // YYYY-MM-DD
  searches: number;
  asks: number;
}

export interface PageStat {
  pageId: string;
  count: number;
  lastTs: string;
}

export interface UsageAggregate {
  totalSearches: number;
  totalAsks: number;
  uniqueQueries: number;
  topQueries: Array<{ query: string; count: number }>;
  topPages: Array<{ pageId: string; count: number }>;
  byDay: UsageDayCount[];
  /** contextTokens 합계 (구형 라인은 0 취급) — 토큰 효율 가시화용 추정치. */
  totalContextTokens: number;
}

/**
 * UsageLog — cfgm search/ask 사용 이력 append-only jsonl 기록 + 집계.
 *
 * 외부 전송 없음 — 로컬 <storageRoot>/stats/usage.jsonl 에만 기록한다.
 * record() 실패는 절대 호출측 커맨드를 실패시키지 않는다 (항상 swallow).
 */
export class UsageLog {
  constructor(private readonly storage: Storage) {}

  async record(entry: UsageEntry): Promise<void> {
    try {
      await this.storage.appendJsonl(LOG_PATH, entry);
    } catch {
      // 사용 통계 기록 실패는 호출측 커맨드 동작에 영향을 주지 않는다.
    }
  }

  async aggregate(opts: { days?: number } = {}): Promise<UsageAggregate> {
    const days = opts.days && opts.days > 0 ? opts.days : DEFAULT_DAYS;
    const entries = await this.readEntries();

    const cutoff = Date.now() - days * 86_400_000;
    const inRange = entries.filter((e) => {
      const t = Date.parse(e.ts);
      return Number.isFinite(t) && t >= cutoff;
    });

    let totalSearches = 0;
    let totalAsks = 0;
    let totalContextTokens = 0;
    const queryCounts = new Map<string, number>();
    const pageCounts = new Map<string, number>();
    const dayCounts = new Map<string, { searches: number; asks: number }>();

    for (const e of inRange) {
      if (e.tool === "search") totalSearches++;
      else if (e.tool === "ask") totalAsks++;

      if (typeof e.contextTokens === "number" && Number.isFinite(e.contextTokens)) {
        totalContextTokens += e.contextTokens;
      }

      if (e.query) queryCounts.set(e.query, (queryCounts.get(e.query) ?? 0) + 1);
      for (const pageId of e.topPageIds ?? []) {
        pageCounts.set(pageId, (pageCounts.get(pageId) ?? 0) + 1);
      }

      const date = e.ts.slice(0, 10);
      const day = dayCounts.get(date) ?? { searches: 0, asks: 0 };
      if (e.tool === "search") day.searches++;
      else if (e.tool === "ask") day.asks++;
      dayCounts.set(date, day);
    }

    const topQueries = [...queryCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([query, count]) => ({ query, count }));

    const topPages = [...pageCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([pageId, count]) => ({ pageId, count }));

    const byDay = [...dayCounts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, c]) => ({ date, searches: c.searches, asks: c.asks }));

    return {
      totalSearches,
      totalAsks,
      uniqueQueries: queryCounts.size,
      topQueries,
      topPages,
      byDay,
      totalContextTokens,
    };
  }

  /**
   * 페이지 단위 회상(recall) 집계 — WikiDecayEngine 의 "최근 회상 빈도" 신호 (V3.35).
   * days 지정 시 해당 기간 내 topPageIds 만 집계. 손상 라인은 readEntries() 에서 이미 skip.
   */
  async pageStats(opts: { days?: number } = {}): Promise<PageStat[]> {
    const entries = await this.readEntries();

    const cutoff = opts.days && opts.days > 0 ? Date.now() - opts.days * 86_400_000 : null;
    const inRange = cutoff === null
      ? entries
      : entries.filter((e) => {
          const t = Date.parse(e.ts);
          return Number.isFinite(t) && t >= cutoff;
        });

    const stats = new Map<string, { count: number; lastTs: string }>();
    for (const e of inRange) {
      for (const pageId of e.topPageIds ?? []) {
        const prev = stats.get(pageId);
        if (!prev) {
          stats.set(pageId, { count: 1, lastTs: e.ts });
        } else {
          prev.count++;
          if (e.ts > prev.lastTs) prev.lastTs = e.ts;
        }
      }
    }

    return [...stats.entries()]
      .map(([pageId, s]) => ({ pageId, count: s.count, lastTs: s.lastTs }))
      .sort((a, b) => b.count - a.count);
  }

  private async readEntries(): Promise<UsageEntry[]> {
    const text = await this.storage.readText(LOG_PATH);
    if (!text) return [];

    const entries: UsageEntry[] = [];
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object" && typeof parsed.ts === "string") {
          entries.push(parsed as UsageEntry);
        }
      } catch {
        // 손상 라인 skip — 집계 크래시 금지.
      }
    }
    return entries;
  }
}
