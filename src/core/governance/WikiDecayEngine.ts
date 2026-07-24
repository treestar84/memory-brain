import { GOVERNANCE_CONFIG, MS_PER_DAY } from "./config";
import type { WikiStatus, WikiType } from "../wiki/types";
import type { PageStat } from "../stats/UsageLog";

/**
 * WikiDecayEngine — L3 wiki page 망각 판정 (V3.35).
 *
 * flow/problem 계층의 StaleDecayEngine 은 있었지만 사용자가 실제 검색하는
 * L3 wiki(`memory/{concepts,decisions,projects}/*.md`) 에는 망각 신호가 없었다.
 * UsageLog 의 "회상 빈도"(pageStats) 를 page age 와 결합해 tier 를 매긴다.
 *
 * 철학: **삭제 금지 — supersede/archive 만 제안**. 본 엔진은 순수 판정만 하고
 * (findings 산출), 실제 archive 조치는 cfgm-decay.ts 에서 페이지 단위 명시 승인으로 수행.
 */

export type WikiDecayTier = "stale-draft" | "decay-candidate" | "aging" | "fresh" | "unknown";

export interface WikiDecayPageInput {
  id: string;
  type: WikiType;
  status: WikiStatus;
  updatedAt: string;
  path: string;
}

export interface WikiDecayFinding {
  pageId: string;
  path: string;
  type: WikiType;
  status: WikiStatus;
  tier: WikiDecayTier;
  ageDays: number;
  recalls: number;
  lastRecallAt: string | null;
  reasons: string[];
}

export interface WikiDecayOptions {
  agingDays?: number;
  staleDays?: number;
  draftStaleDays?: number;
  recallWindowDays?: number;
}

/**
 * 순수 함수 — now/설정을 주입받아 결정론적으로 tier 를 판정한다.
 * updatedAt 파싱 실패 시 크래시하지 않고 tier: "unknown" 으로 기록.
 */
export function evaluateWikiDecay(
  pages: readonly WikiDecayPageInput[],
  pageStats: readonly PageStat[],
  nowIso: string,
  opts: WikiDecayOptions = {},
): WikiDecayFinding[] {
  const agingDays = opts.agingDays ?? GOVERNANCE_CONFIG.WIKI_AGING_DAYS;
  const staleDays = opts.staleDays ?? GOVERNANCE_CONFIG.WIKI_STALE_DAYS;
  const draftStaleDays = opts.draftStaleDays ?? GOVERNANCE_CONFIG.WIKI_DRAFT_STALE_DAYS;
  const recallWindowDays = opts.recallWindowDays ?? GOVERNANCE_CONFIG.WIKI_RECALL_WINDOW_DAYS;

  const nowMs = Date.parse(nowIso);
  const statsById = new Map(pageStats.map((s) => [s.pageId, s]));

  return pages.map((page) => {
    const stat = statsById.get(page.id);
    const recalls = stat?.count ?? 0;
    const lastRecallAt = stat?.lastTs ?? null;

    const updatedMs = Date.parse(page.updatedAt);
    if (!Number.isFinite(updatedMs)) {
      return {
        pageId: page.id,
        path: page.path,
        type: page.type,
        status: page.status,
        tier: "unknown" as const,
        ageDays: NaN,
        recalls,
        lastRecallAt,
        reasons: [`updatedAt 파싱 불가: "${page.updatedAt}"`],
      };
    }

    const ageDays = Math.floor((nowMs - updatedMs) / MS_PER_DAY);
    const recentlyRecalled =
      lastRecallAt !== null &&
      Number.isFinite(Date.parse(lastRecallAt)) &&
      nowMs - Date.parse(lastRecallAt) <= recallWindowDays * MS_PER_DAY;

    const reasons: string[] = [];
    let tier: WikiDecayTier;

    if (page.status === "draft" && ageDays > draftStaleDays) {
      tier = "stale-draft";
      reasons.push(
        `status=draft, age=${ageDays}일 > ${draftStaleDays}일 — 승격되지 않은 초안 방치`,
      );
    } else if (page.status === "active" && ageDays > staleDays && !recentlyRecalled) {
      tier = "decay-candidate";
      reasons.push(`status=active, age=${ageDays}일 > ${staleDays}일`);
      reasons.push(
        `최근 ${recallWindowDays}일 내 회상 0회 (전체 회상 ${recalls}회, 마지막: ${lastRecallAt ?? "없음"})`,
      );
    } else if (page.status === "active" && ageDays > agingDays) {
      tier = "aging";
      reasons.push(`status=active, age=${ageDays}일 > ${agingDays}일`);
      if (recentlyRecalled) {
        reasons.push(`최근 ${recallWindowDays}일 내 회상 있음 — decay 아님 (마지막: ${lastRecallAt})`);
      }
    } else {
      tier = "fresh";
      reasons.push(`age=${ageDays}일 — 임계값 이내`);
    }

    return {
      pageId: page.id,
      path: page.path,
      type: page.type,
      status: page.status,
      tier,
      ageDays,
      recalls,
      lastRecallAt,
      reasons,
    };
  });
}
