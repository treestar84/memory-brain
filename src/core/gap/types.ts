export const STRUCTURAL_DETECTOR_IDS = [
  "rule:orphan-action",
  "rule:unsupported-hypothesis",
  "rule:stale-confirmed",
  "rule:uncaused-problem",
  "rule:low-confidence-critical",
  "rule:conflicting-outcomes",
  "rule:dangling-evidence",
  "rule:unmitigated-cause",
] as const;

export type StructuralDetectorId = typeof STRUCTURAL_DETECTOR_IDS[number];
export type DetectorId = StructuralDetectorId | "semantic";

export type GapCandidate = {
  detectorId: DetectorId;
  subjectBlockId: string;
  severity: number;
  label: string;
  extra?: Record<string, unknown>;
};

export type VoiFactors = {
  severity: number;
  centrality: number;
  recency: number;
  confidenceGap: number;
  semanticBoost: number;
};

export type QuestionLifecycle = "pending" | "asked" | "answered" | "stale";

export type AskedRecord = {
  questionBlockId: string;
  gapBlockId: string;
  problemId: string;
  askedAtIso: string;
  sessionId: string;
  promptTurnOrdinal: number;
};

export type CurrentGapsSnapshot = {
  generatedAt: string;
  generatorVersion: string;
  gaps: Array<{
    gapBlockId: string;
    problemId: string;
    detectorId: DetectorId;
    subjectBlockId: string;
    severity: number;
    voi: number;
    hasQuestion: boolean;
    questionBlockId: string | null;
  }>;
};

export type PendingQuestionRecord = {
  questionBlockId: string;
  problemId: string;
  gapBlockId: string;
  label: string;
  voi: number;
  createdAt: string;
};
