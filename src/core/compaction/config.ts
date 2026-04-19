export const RESUME_CONFIG = {
  MAX_DELTAS: 20,
  MAX_GAPS: 10,
  MAX_PENDING_QUESTIONS: 5,
} as const;

export function resumeSheetPath(sessionId: string): string {
  return `state/resume-sheet-${sessionId}.json`;
}

export const RESUME_SHEET_DIR = "state";
export const RESUME_SHEET_PREFIX = "resume-sheet-";
export const RESUME_SHEET_SUFFIX = ".json";

export function isResumeSheetFilename(name: string): boolean {
  return name.startsWith(RESUME_SHEET_PREFIX) && name.endsWith(RESUME_SHEET_SUFFIX);
}
