import type {
  GovernanceDetector,
  GovernanceInput,
  DetectorReport,
  Finding,
} from "./types";
import type { LogicalNode, ResourceScope, SSLDocument, StructuralNode } from "../../ontology/ssl";

/**
 * SSL risk detector (PR-V3.15, paper arXiv 2604.24026 §4.2).
 *
 * Rule-based 1차 — Logical layer 의 action × resource scope 조합과 Scene
 * 배치를 검사해 risk Finding 을 emit. ML classifier (paper §4.2) 는
 * 누적 데이터가 쌓인 후 PR-V3.16 이상에서 layering.
 *
 * Rules:
 * - critical: 어떤 Logical 이 CREDENTIALS scope 를 사용
 * - warning : WRITE × NETWORK 조합 (data exfil 가능성)
 * - warning : WRITE 가 ACT 외 Scene 에서 발생 (의도된 phase 밖 mutation)
 * - info    : skill 이 3+ 개 distinct resource scope 사용 (광범위 권한)
 */
export class SSLRiskDetector implements GovernanceDetector {
  readonly id = "ssl-risk";

  detect(input: GovernanceInput): DetectorReport {
    const findings: Finding[] = [];
    const skills = input.skills ?? [];

    for (const skill of skills) {
      const skillName = skill.scheduling.skillName;
      const writeContainerByLogicalId = mapWriteScenes(skill);
      const allScopes = new Set<ResourceScope>();

      for (const logical of skill.logical) {
        for (const scope of logical.resources) allScopes.add(scope);

        if (logical.resources.includes("CREDENTIALS")) {
          findings.push({
            severity: "critical",
            subject: `${skillName}::${logical.id}`,
            message: `Logical action ${logical.action} touches CREDENTIALS scope`,
            evidence: [logical.description ?? "", `resources: ${logical.resources.join(",")}`],
          });
        }

        if (logical.action === "WRITE" && logical.resources.includes("NETWORK")) {
          findings.push({
            severity: "warning",
            subject: `${skillName}::${logical.id}`,
            message: "WRITE × NETWORK combo — 잠재 data exfiltration 경로",
            evidence: [logical.description ?? "", `resources: ${logical.resources.join(",")}`],
          });
        }

        if (logical.action === "WRITE") {
          const scene = writeContainerByLogicalId.get(logical.id);
          if (scene && scene !== "ACT" && scene !== "RECOVER" && scene !== "FINALIZE") {
            findings.push({
              severity: "warning",
              subject: `${skillName}::${logical.id}`,
              message: `WRITE 가 Scene ${scene} 에서 발생 — ACT/RECOVER/FINALIZE 외 mutation`,
              evidence: [logical.description ?? "", `scene: ${scene}`],
            });
          }
        }
      }

      if (allScopes.size >= 3) {
        findings.push({
          severity: "info",
          subject: skillName,
          message: `광범위 권한 — ${allScopes.size}개 resource scope 사용`,
          evidence: [`scopes: ${[...allScopes].sort().join(",")}`],
        });
      }
    }

    return {
      detectorId: this.id,
      generatedAt: input.now,
      findings,
      summary:
        skills.length === 0
          ? "SSL skill 입력 없음 — risk gate skip."
          : findings.length === 0
            ? `${skills.length}개 skill 모두 risk-free.`
            : `${skills.length}개 skill 검사 → ${findings.length}건 risk finding.`,
    };
  }
}

function mapWriteScenes(skill: SSLDocument): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of skill.structural as StructuralNode[]) {
    for (const lid of s.containsLogicalIds) {
      const logical = skill.logical.find((l: LogicalNode) => l.id === lid);
      if (logical?.action === "WRITE") out.set(lid, s.scene);
    }
  }
  return out;
}
