/**
 * Learning Ledger 도메인 타입 (PR-V3.11).
 *
 * 사용자 지적사항 (2026-04-29): "학습 개선을 위한 루프가 완벽하게 안정적인
 * 장치로". 비전 §1 "self-improving skill loop" + Hermes 답습.
 *
 * 1차는 **기록 + 통계만**. detector 자동 페널티는 운영 데이터 누적 후
 * 별도 PR.
 */

export const LEARNING_EVENT_TYPES = ["decision", "supersede", "invalidate"] as const;
export type LearningEventType = (typeof LEARNING_EVENT_TYPES)[number];

export const LEARNING_LEDGERS = ["claim", "promotion"] as const;
export type LearningLedgerKind = (typeof LEARNING_LEDGERS)[number];

export interface LearningDecisionEvent {
  type: "decision";
  ledger: LearningLedgerKind;
  candidateId: string;
  detectorId: string;
  decision: "accepted" | "rejected";
  decidedAt: string;
  decidedBy: string | null;
  reason: string | null;
}

export interface LearningSupersedeEvent {
  type: "supersede";
  ledger: LearningLedgerKind;
  prevId: string;
  newId: string;
  detectorId: string;
  at: string;
}

export interface LearningInvalidateEvent {
  type: "invalidate";
  ledger: LearningLedgerKind;
  candidateId: string;
  detectorId: string;
  reason: string;
  at: string;
}

export type LearningEvent =
  | LearningDecisionEvent
  | LearningSupersedeEvent
  | LearningInvalidateEvent;

export interface DetectorStats {
  detectorId: string;
  accepted: number;
  rejected: number;
  superseded: number;
  invalidated: number;
  total: number;
  /** Bayesian smoothed accept rate. α=β=2 (prior). */
  weight: number;
  rawAcceptRate: number;
}
