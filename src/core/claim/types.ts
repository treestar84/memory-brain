export const CLAIM_TYPES = [
  "architecture_decision",
  "technology_decision",
  "rule",
  "outcome",
  "persona_inference",
  "user_fact",
  "open_question",
] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];

export const CLAIM_STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "superseded",
  "archived",
  "deprecated",
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export type ClaimEvidence = {
  source: string;
  quote: string | null;
};

export interface ClaimCandidate {
  candidateId: string;
  bundleId: string;
  blockId: string;
  proposedType: ClaimType;
  proposedText: string;
  detectedBy: string;
  confidence: number;
  evidence: ClaimEvidence[];
  status: ClaimStatus;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  reason: string | null;
  /**
   * Graphiti supersede 모델 답습 (PR-V3.5, ADR-019 §결정 §3).
   * - validFrom: claim 이 유효하기 시작한 시점 (accept 시점 = decidedAt)
   * - validTo: 유효 종료 시점 (supersede 시 자동 설정)
   * - invalidAt: 명시 invalid 시점 (rejected 와 다름 — 유효했으나 후속 검증으로 무효 판명)
   */
  validFrom?: string;
  validTo?: string | null;
  invalidAt?: string | null;
  /** supersede 시 새 claim 의 후보 ID. 이전 claim 에 기록 (역방향 참조) */
  supersededBy?: string;
  /**
   * append 시점 타임스탬프 (createdAt 과 다름 — createdAt 은 후보 최초 생성
   * 시점으로 같은 candidateId 의 모든 리비전에서 불변, recordedAt 은 이
   * 특정 레코드가 원장에 append 된 시점). git `merge=union` 으로 두 머신의
   * ledger.jsonl 을 합칠 때 줄 순서가 보존되지 않으므로, `ClaimStore.list()`
   * 의 last-wins reduce 가 파일 순서 대신 이 필드로 승자를 가려 순서 독립성을
   * 확보한다. 이 필드가 없는(마이그레이션 이전) 레코드는 파일 순서로 폴백.
   */
  recordedAt?: string;
}
