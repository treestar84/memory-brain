import type {
  GovernanceDetector,
  GovernanceInput,
  DetectorReport,
  Finding,
} from "./types";

const REVIEW_OVERDUE_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * status=pending 이 7일 이상 누적된 claim 검출 — 결정 대기 큐.
 *
 * 1주 백스톱 (ADR-018 §1) 정신 답습 — 사용자 검토 부담 가시화.
 * `cfgm-promote` review/batch 흐름과 정합 — pending 누적 ≥ 5 시 nudge,
 * 본 detector 는 누적 시간 기준 추가 시그널.
 */
export class ReviewQueueDetector implements GovernanceDetector {
  readonly id = "review-queue";

  detect(input: GovernanceInput): DetectorReport {
    const nowMs = Date.parse(input.now);
    const findings: Finding[] = [];

    for (const c of input.claims) {
      if (c.status !== "pending") continue;
      const ageMs = nowMs - Date.parse(c.createdAt);
      const ageDays = Math.floor(ageMs / MS_PER_DAY);
      if (ageDays < REVIEW_OVERDUE_DAYS) continue;

      findings.push({
        severity: ageDays >= 14 ? "warning" : "info",
        subject: c.candidateId,
        message: `${ageDays}일 pending — accept/reject 또는 룰 재설계 검토`,
        evidence: [
          `proposedType: ${c.proposedType}`,
          `detectedBy: ${c.detectedBy}`,
          `confidence: ${c.confidence}`,
        ],
      });
    }

    return {
      detectorId: this.id,
      generatedAt: input.now,
      findings,
      summary:
        findings.length === 0
          ? "review-queue overdue 없음."
          : `${findings.length}건 ≥ ${REVIEW_OVERDUE_DAYS}일 pending — /cfgm-promote review 권장.`,
    };
  }
}
