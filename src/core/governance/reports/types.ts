import type { ClaimCandidate } from "../../claim/types";
import type { WikiPage } from "../../wiki/types";
import type { SSLDocument } from "../../ontology/ssl";

/**
 * Governance Layer 도메인 타입 (PR-V3.7, vision §10).
 *
 * 5 detector — duplicate / stale / contradiction / low-confidence / review-queue.
 * 각 detector → DetectorReport. ReportWriter 가 markdown 으로 직렬화.
 */

export type FindingSeverity = "info" | "warning" | "critical";

export interface Finding {
  severity: FindingSeverity;
  subject: string;
  message: string;
  evidence?: string[];
}

export interface DetectorReport {
  detectorId: string;
  generatedAt: string;
  findings: Finding[];
  summary: string;
}

export interface GovernanceInput {
  claims: ClaimCandidate[];
  wikiPages: WikiPage[];
  /** SSL skill documents (PR-V3.15). Optional — pre-existing detectors ignore. */
  skills?: SSLDocument[];
  /**
   * Set of "<ACTION>/<RES1,RES2,...sorted>" signatures already covered by
   * the canonical store (PR-V3.17c). 호출자가 미리 store 로드 후 넘기면
   * CanonicalCandidatesDetector 가 이미 등록된 패턴은 skip.
   */
  knownCanonicalSignatures?: Set<string>;
  /** ISO timestamp — 검증 기준 시점 */
  now: string;
}

export interface GovernanceDetector {
  readonly id: string;
  detect(input: GovernanceInput): DetectorReport;
}
