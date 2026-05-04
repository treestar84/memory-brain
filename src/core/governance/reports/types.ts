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
  /** ISO timestamp — 검증 기준 시점 */
  now: string;
}

export interface GovernanceDetector {
  readonly id: string;
  detect(input: GovernanceInput): DetectorReport;
}
