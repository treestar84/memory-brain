import type {
  GovernanceDetector,
  GovernanceInput,
  DetectorReport,
  Finding,
} from "./types";

/**
 * 같은 blockId 에서 파생된 claim 이 2건 이상 + 둘 다 accepted 면서
 * supersedes 관계가 아닌 경우 = 모순 후보.
 *
 * 1차 휴리스틱 — semantic contradiction 은 후속 PR (LLM 또는 vector
 * embedding 차이 분석).
 */
export class ContradictionsDetector implements GovernanceDetector {
  readonly id = "contradictions";

  detect(input: GovernanceInput): DetectorReport {
    const byBlock = new Map<string, typeof input.claims>();
    for (const c of input.claims) {
      if (c.status !== "accepted") continue;
      if (c.invalidAt) continue;
      if (!byBlock.has(c.blockId)) byBlock.set(c.blockId, []);
      byBlock.get(c.blockId)!.push(c);
    }

    const findings: Finding[] = [];
    for (const [blockId, group] of byBlock) {
      if (group.length < 2) continue;

      // supersedes 관계가 명시된 그룹은 제외 (정상 lifecycle)
      const ids = new Set(group.map((c) => c.candidateId));
      const allLinked = group.every(
        (c) => c.supersededBy && ids.has(c.supersededBy),
      );
      if (allLinked) continue;

      findings.push({
        severity: "warning",
        subject: blockId,
        message: `같은 blockId 에서 ${group.length} accepted claim — supersede 관계 미설정`,
        evidence: group.map(
          (c) => `${c.candidateId}: "${c.proposedText.slice(0, 40)}…"`,
        ),
      });
    }

    return {
      detectorId: this.id,
      generatedAt: input.now,
      findings,
      summary:
        findings.length === 0
          ? "모순 claim 없음."
          : `${findings.length}건 잠재 모순 — supersede 또는 invalidate 결정 필요.`,
    };
  }
}
