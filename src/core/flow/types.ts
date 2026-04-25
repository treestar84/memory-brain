export const FLOW_BLOCK_TYPES = [
  "Problem", "State", "Trigger", "Context", "Constraint",
  "Cause", "Hypothesis", "Action", "Evidence", "Outcome",
  "Rule", "Gap", "Question",
] as const;
export type FlowBlockType = typeof FLOW_BLOCK_TYPES[number];

export const RELATION_KINDS = [
  "causes", "evidencedBy", "mitigatedBy",
  "validatedBy", "followsFrom",
] as const;
export type RelationKind = typeof RELATION_KINDS[number];

export type Relation = {
  kind: RelationKind;
  targetBlockId: string;
  confidence: number;
};

// PR-6: provenance/extractor 라벨링용 reserved key + 확장 슬롯.
// confidenceLabel은 FlowBlock.confidence(number)와 의미 분리된 string 라벨.
export type FlowBlockMetadata = {
  author?: string;
  subject?: string;
  source?: string;
  confidenceLabel?: string;
  [key: string]: string | undefined;
};

export type FlowBlock = {
  blockId: string;
  problemId: string;
  type: FlowBlockType;
  status: "confirmed" | "superseded";
  label: string;
  confidence: number;
  supportedBy: string[];
  relations: Relation[];
  createdAt: string;
  lastConfirmedAt: string | null;
  staleAfter: string | null;
  supersededBy: string | null;
  bundleId: string;
  metadata?: FlowBlockMetadata;

  // Gap 전용 (type === "Gap")
  detectorId?: string;
  subject?: { blockId: string };
  severity?: number;
  semanticBoost?: number;

  // Question 전용 (type === "Question")
  gapBlockId?: string;
  lifecycle?: "pending" | "asked" | "answered" | "stale";
  askedAt?: string | null;
  answeredByBundleId?: string | null;
  answerBlockId?: string | null;

  // Gap·Question 공통
  voiCached?: number;

  // Outcome 전용
  polarity?: "+" | "-" | null;
};

export type FlowDelta =
  | { op: "block-add"; timestampIso: string; block: FlowBlock }
  | { op: "block-supersede"; timestampIso: string; problemId: string; blockId: string; supersededBy: string; reason: string }
  | { op: "relation-add"; timestampIso: string; problemId: string; fromBlockId: string; relation: Relation }
  | { op: "cue-card-regen"; timestampIso: string; problemId: string; bodyHash: string; bodyBytes: number };

export type BundleMetrics = {
  toolCallCounts: Record<string, number>;
  touchedFiles: string[];
  bashExit: { success: number; failure: number };
  promptCount: number;
};

export type ObservationBundle = {
  bundleId: string;
  activeProblemId: string | null;
  sessionId: string;
  turnOrdinal: number;
  openedAt: string;
  sealedAt: string;
  eventIds: string[];
  observations: Array<Record<string, unknown>>;
  metrics: BundleMetrics;
  recentBlockIds: string[];
  processedAt: string | null;
  processedByVersion: string | null;
};

export type FlowGraph = {
  problemId: string;
  blocks: FlowBlock[];
  cueCardMeta: {
    lastSyntheticAt: string | null;
    bodyHash: string | null;
    bodyBytes: number;
    stale: boolean;
  };
};
