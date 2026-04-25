export const IDENTITY_TARGETS = [
  "telos", "persona", "user", "tools", "voice",
  "beliefs", "models", "strategies", "ideas",
] as const;
export type IdentityTarget = typeof IDENTITY_TARGETS[number];

export const PROMOTION_STATUSES = ["pending", "accepted", "rejected", "superseded"] as const;
export type PromotionStatus = typeof PROMOTION_STATUSES[number];

export interface PromotedCandidate {
  candidateId: string;
  bundleId: string;
  proposedTarget: IdentityTarget;
  proposedLabel: string;
  detectedBy: string;
  metrics: Record<string, number>;
  status: PromotionStatus;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  reason: string | null;
}
