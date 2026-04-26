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
}
