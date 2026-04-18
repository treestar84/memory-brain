import type { FlowBlockType, RelationKind } from "../flow/types";

export type FlowTemplate = {
  id: string;
  version: string;
  description: string;
  requiredBlockTypes: FlowBlockType[];
  recommendedBlockTypes: FlowBlockType[];
  expectedRelations: Array<{
    from: FlowBlockType;
    to: FlowBlockType;
    kind: RelationKind;
  }>;
  minConfidence: number;
};

export type OntologyModuleData = {
  problemId: string;
  templateId: string;
  templateVersion: string;
  resolvedRuns: number;
  createdAt: string;
  lastUpdatedAt: string;
  observedPatterns: Record<string, number>;
  promotedAt: string | null;
};
