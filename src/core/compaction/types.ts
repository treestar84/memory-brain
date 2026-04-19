import type { FlowDelta } from "../flow/types";
import type { DetectorId } from "../gap/types";

export const RESUME_SHEET_VERSION = "resume-sheet@1.0.0" as const;

export type ResumeSheet = {
  version: typeof RESUME_SHEET_VERSION;
  generatedAt: string;
  sessionId: string;
  problemId: string | null;
  recentDeltas: Array<{
    op: FlowDelta["op"];
    timestampIso: string;
    summary: string;
  }>;
  openGaps: Array<{
    gapBlockId: string;
    detectorId: DetectorId;
    subjectBlockId: string;
    severity: number;
    voi: number;
    hasQuestion: boolean;
  }>;
  topPendingQuestions: Array<{
    questionBlockId: string;
    label: string;
    voi: number;
  }>;
};
