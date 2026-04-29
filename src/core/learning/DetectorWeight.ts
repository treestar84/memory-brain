import type { LearningLedger } from "./LearningLedger";
import type { DetectorStats, LearningLedgerKind } from "./types";

const PRIOR_ALPHA = 2;
const PRIOR_BETA = 2;

/**
 * Detector weight 계산 (PR-V3.11).
 *
 * LearningLedger 의 decision/supersede/invalidate 이벤트 → detector 별
 * Bayesian smoothed accept rate.
 *
 * weight = (accepted + α) / (accepted + rejected + α + β),  α=β=2
 *
 * α=β=2 prior 는 "관측 0건" 시 weight = 0.5 (중립). 1~2건 누적이어도
 * extreme value 회피. 충분한 데이터 누적 시 raw rate 에 수렴.
 *
 * 1차는 통계 조회만 — detector 자동 페널티 적용은 별도 PR.
 */
export class DetectorWeight {
  constructor(private readonly ledger: LearningLedger) {}

  async getStats(detectorId: string, filter: { ledger?: LearningLedgerKind } = {}): Promise<DetectorStats> {
    const events = await this.ledger.list(filter);
    let accepted = 0;
    let rejected = 0;
    let superseded = 0;
    let invalidated = 0;

    for (const e of events) {
      if (e.detectorId !== detectorId) continue;
      if (e.type === "decision") {
        if (e.decision === "accepted") accepted += 1;
        else rejected += 1;
      } else if (e.type === "supersede") {
        superseded += 1;
      } else if (e.type === "invalidate") {
        invalidated += 1;
      }
    }

    const decided = accepted + rejected;
    const total = decided + superseded + invalidated;
    const weight = (accepted + PRIOR_ALPHA) / (decided + PRIOR_ALPHA + PRIOR_BETA);
    const rawAcceptRate = decided === 0 ? 0 : accepted / decided;

    return {
      detectorId,
      accepted,
      rejected,
      superseded,
      invalidated,
      total,
      weight,
      rawAcceptRate,
    };
  }

  async getAllStats(filter: { ledger?: LearningLedgerKind } = {}): Promise<DetectorStats[]> {
    const events = await this.ledger.list(filter);
    const ids = new Set<string>();
    for (const e of events) ids.add(e.detectorId);
    const result: DetectorStats[] = [];
    for (const id of ids) {
      result.push(await this.getStats(id, filter));
    }
    // weight 낮은 순 (가장 약한 detector 가 위로)
    result.sort((a, b) => a.weight - b.weight);
    return result;
  }
}
