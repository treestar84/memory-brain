import type {
  GovernanceDetector,
  GovernanceInput,
  DetectorReport,
  Finding,
} from "./types";

/**
 * 동일 proposedText (NFKC normalize) 의 claim ≥ 2건 검출.
 * 단순 string equality 1차 — semantic similarity 는 후속 PR (vector index).
 */
export class DuplicateCandidatesDetector implements GovernanceDetector {
  readonly id = "duplicate-candidates";

  detect(input: GovernanceInput): DetectorReport {
    const buckets = new Map<string, typeof input.claims>();
    for (const c of input.claims) {
      if (c.status === "rejected" || c.status === "superseded") continue;
      const key = c.proposedText.normalize("NFKC").toLowerCase().trim();
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(c);
    }

    const findings: Finding[] = [];
    for (const [key, group] of buckets) {
      if (group.length < 2) continue;
      findings.push({
        severity: "warning",
        subject: group[0]!.candidateId,
        message: `중복 후보 ${group.length}건 — "${key.slice(0, 60)}${key.length > 60 ? "…" : ""}"`,
        evidence: group.map((c) => c.candidateId),
      });
    }

    return {
      detectorId: this.id,
      generatedAt: input.now,
      findings,
      summary:
        findings.length === 0
          ? "중복 후보 없음."
          : `${findings.length} 중복 그룹 — accept/reject/supersede 결정 필요.`,
    };
  }
}
