import type {
  GovernanceDetector,
  GovernanceInput,
  DetectorReport,
  Finding,
} from "./types";
import type { LogicalNode } from "../../ontology/ssl";

/**
 * CanonicalCandidatesDetector (PR-V3.17c) — SSL 의 inline logical 패턴 중
 * N≥3 회 반복 등장하는 (action × resources) signature 를 canonical store
 * 후보로 자동 발견.
 *
 * 사용자 우려 (중복 처리 명확화) 의 운영 메커니즘 — 새 skill 이 추가될 때
 * 마다 dedup 분석 자동. 결과는 사람 검토 후 canonical store yaml 에 등록.
 *
 * Signature: `<ACTION>/<RES1,RES2,...sorted>` (예: `READ/LOCAL_FS`)
 * GovernanceInput.knownCanonicalSignatures 가 주어지면 이미 등록된 시그
 * 니쳐는 후보에서 제외.
 */
export class CanonicalCandidatesDetector implements GovernanceDetector {
  readonly id = "canonical-candidates";
  static readonly THRESHOLD = 3;

  detect(input: GovernanceInput): DetectorReport {
    const findings: Finding[] = [];
    const skills = input.skills ?? [];
    const known = input.knownCanonicalSignatures ?? new Set<string>();

    if (skills.length === 0) {
      return {
        detectorId: this.id,
        generatedAt: input.now,
        findings,
        summary: "SSL skill 입력 없음 — canonical 분석 skip.",
      };
    }

    // signature → occurrences
    type Occurrence = { skill: string; logicalId: string; description: string };
    const buckets = new Map<string, Occurrence[]>();

    for (const skill of skills) {
      for (const l of skill.logical) {
        if (l.actionRef) continue; // 이미 ref 사용 중 → skip
        const sig = signatureOf(l);
        if (known.has(sig)) continue;
        if (!buckets.has(sig)) buckets.set(sig, []);
        buckets.get(sig)!.push({
          skill: skill.scheduling.skillName,
          logicalId: l.id,
          description: l.description.slice(0, 80),
        });
      }
    }

    // N≥THRESHOLD 후보만
    const sorted = [...buckets.entries()]
      .filter(([, items]) => items.length >= CanonicalCandidatesDetector.THRESHOLD)
      .sort((a, b) => b[1].length - a[1].length);

    for (const [sig, items] of sorted) {
      const skillSet = new Set(items.map((i) => i.skill));
      const sample = items.slice(0, 3).map((i) => `${i.skill}::${i.logicalId} — "${i.description}"`);
      findings.push({
        severity: "info",
        subject: sig,
        message: `${items.length} occurrences across ${skillSet.size} skill(s) — canonical 후보 (yaml 등록 검토)`,
        evidence: sample,
      });
    }

    return {
      detectorId: this.id,
      generatedAt: input.now,
      findings,
      summary:
        findings.length === 0
          ? `${skills.length}개 skill 분석 → 신규 canonical 후보 없음 (모두 ref 사용 또는 N<${CanonicalCandidatesDetector.THRESHOLD})`
          : `${skills.length}개 skill 분석 → ${findings.length}건 canonical 후보 발견`,
    };
  }
}

/** Helper: SSL 들에서 canonical-등록된 signature set 만들기 (호출자 편의) */
export function buildKnownSignatures(canonicalDefs: Array<{ action: string; resources: string[] }>): Set<string> {
  const out = new Set<string>();
  for (const def of canonicalDefs) {
    out.add(makeSignature(def.action, def.resources));
  }
  return out;
}

function signatureOf(l: LogicalNode): string {
  return makeSignature(l.action, l.resources);
}

function makeSignature(action: string, resources: string[]): string {
  return `${action}/${[...resources].sort().join(",")}`;
}
