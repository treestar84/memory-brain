/**
 * Memory Router 도메인 타입 (PR-V3.3, vision §6).
 *
 * RequestClassifier → categories (다중 가능)
 * LaneSelector → lanes (categories 기반)
 * ContextBudget → 한 번에 열 파일 수 / source 조회 정책 강제
 */

export const REQUEST_CATEGORIES = [
  "QUICK",
  "DEEP",
  "PROJECT",
  "PERSONAL",
  "VERIFY",
  "WRITE",
  "CODE",
  "RESEARCH",
  "CONFLICT",
  "MAINTENANCE",
] as const;
export type RequestCategory = (typeof REQUEST_CATEGORIES)[number];

export const MEMORY_LANES = [
  "current",
  "project",
  "concept",
  "decision",
  "persona",
  "evidence",
  "governance",
  "code",
  "research",
] as const;
export type MemoryLane = (typeof MEMORY_LANES)[number];

export interface ClassificationResult {
  categories: RequestCategory[];
  /** matched keyword evidence — debugging / observability */
  evidence: Array<{ category: RequestCategory; pattern: string }>;
}

export interface LaneSelectionResult {
  lanes: MemoryLane[];
  reason: string;
}

export interface BudgetCheckResult {
  allowed: boolean;
  reason: string;
  /** 현재 사용된 슬롯 수 / 한도 */
  used: number;
  limit: number;
}

export interface RouteDecision {
  classification: ClassificationResult;
  selection: LaneSelectionResult;
  /** RouterMappings 결과 — keyword/symbol → 정확한 file paths (PR-V3.10) */
  mapping?: {
    files: string[];
    matchedRules: string[];
  };
  /** 1쪽 요약 — UserPromptSubmit stdout context 용 */
  summary: string;
}

export const CONTEXT_BUDGET_LIMITS = {
  CANONICAL_PAGES: 3,
  SOURCE_FILES_PER_REQUEST: 3,
  PERSONA_FILES_PER_REQUEST: 2,
} as const;
