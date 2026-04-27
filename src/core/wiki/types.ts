/**
 * Wiki Layer 도메인 타입 (PR-V3.4, vision §5.4 + OpenClaw 포맷 답습).
 *
 * canonical knowledge page 명세 — `memory/{projects,concepts,decisions}/*.md`.
 * `memory/sources/` 는 raw evidence 라 본 형식 적용 안 함.
 */

export const WIKI_TYPES = ["project", "concept", "decision"] as const;
export type WikiType = (typeof WIKI_TYPES)[number];

export const WIKI_STATUSES = [
  "active",
  "draft",
  "superseded",
  "archived",
  "deprecated",
] as const;
export type WikiStatus = (typeof WIKI_STATUSES)[number];

export const WIKI_CONFIDENCES = ["high", "medium", "low"] as const;
export type WikiConfidence = (typeof WIKI_CONFIDENCES)[number];

export interface WikiPageFrontmatter {
  id: string;
  type: WikiType;
  status: WikiStatus;
  confidence?: WikiConfidence;
  tags?: string[];
  related?: string[];
  supersedes?: string[];
  updated_at: string;
}

export interface WikiPage {
  /** 파일 경로 (`memory/...` 기준 상대) */
  path: string;
  frontmatter: WikiPageFrontmatter;
  /** frontmatter 제외 본문 markdown */
  body: string;
  /** 본문에서 추출한 claim id 배열 (`<!-- claim:cl-... -->` 인라인) */
  claimIds: string[];
  /** "## Evidence" 섹션의 bullet 라인 (각 인용 1개) */
  evidence: string[];
}

export interface WikiPageValidationError {
  path: string;
  field: string;
  message: string;
}
