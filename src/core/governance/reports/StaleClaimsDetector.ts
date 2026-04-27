import type {
  GovernanceDetector,
  GovernanceInput,
  DetectorReport,
  Finding,
} from "./types";

const STALE_DAYS = 60;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 60일 이상 미접근 (createdAt 기준) + status=accepted 인 claim 검출.
 * `archived/superseded/rejected` 는 제외 (이미 lifecycle 종료).
 *
 * 후속 PR 에서 lastAccessedAt 필드 도입 시 그것 기준으로 변경.
 * 1차는 createdAt 으로 보수적 검출.
 */
export class StaleClaimsDetector implements GovernanceDetector {
  readonly id = "stale-claims";

  detect(input: GovernanceInput): DetectorReport {
    const nowMs = Date.parse(input.now);
    const findings: Finding[] = [];

    for (const c of input.claims) {
      if (c.status !== "accepted") continue;
      const ageMs = nowMs - Date.parse(c.createdAt);
      const ageDays = Math.floor(ageMs / MS_PER_DAY);
      if (ageDays < STALE_DAYS) continue;

      findings.push({
        severity: "info",
        subject: c.candidateId,
        message: `${ageDays}일 전 생성 — decay 또는 archive 검토`,
        evidence: [`createdAt: ${c.createdAt}`, `confidence: ${c.confidence}`],
      });
    }

    return {
      detectorId: this.id,
      generatedAt: input.now,
      findings,
      summary:
        findings.length === 0
          ? "stale claim 없음."
          : `${findings.length}건 stale — decay 우선순위↓ 또는 archive 권장.`,
    };
  }
}
