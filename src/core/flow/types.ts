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
