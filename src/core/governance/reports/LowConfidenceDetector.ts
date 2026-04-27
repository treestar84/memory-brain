import type {
  GovernanceDetector,
  GovernanceInput,
  DetectorReport,
  Finding,
} from "./types";

const CONFIDENCE_THRESHOLD = 0.5;

/**
 * confidence < 0.5 인 accepted claim 또는 evidence 가 비어있는 accepted claim 검출.
 *
 * 비전 §3.3 — "evidence 없는 high-confidence claim 금지" 정신 답습.
 * accept 되었으나 근거 약한 claim 을 governance 가시화.
 */
export class LowConfidenceDetector implements GovernanceDetector {
  readonly id = "low-confidence";

  detect(input: GovernanceInput): DetectorReport {
    const findings: Finding[] = [];

    for (const c of input.claims) {
      if (c.status !== "accepted") continue;

      const lowConfidence = c.confidence < CONFIDENCE_THRESHOLD;
      const noEvidence = !Array.isArray(c.evidence) || c.evidence.length === 0;
      if (!lowConfidence && !noEvidence) continue;

      const reasons: string[] = [];
      if (lowConfidence) reasons.push(`confidence ${c.confidence} < ${CONFIDENCE_THRESHOLD}`);
      if (noEvidence) reasons.push("evidence 비어있음");

      findings.push({
        severity: noEvidence ? "warning" : "info",
        subject: c.candidateId,
        message: reasons.join(" + "),
        evidence: [`status: ${c.status}`, `proposedText: "${c.proposedText.slice(0, 60)}…"`],
      });
    }

    return {
      detectorId: this.id,
      generatedAt: input.now,
      findings,
      summary:
        findings.length === 0
          ? "low-confidence claim 없음."
          : `${findings.length}건 — evidence 보강 또는 invalidate 검토.`,
    };
  }
}
