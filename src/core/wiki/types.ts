/**
 * Wiki Layer 도메인 타입 (PR-V3.4, vision §5.4 + OpenClaw 포맷 답습).
 *
 * canonical knowledge page 명세 — `memory/{projects,concepts,decisions}/*.md`.
 * `memory/sources/` 는 raw evidence 라 본 형식 적용 안 함.
 */

export const WIKI_TYPES = ["project", "concept", "decision", "note"] as const;
export type WikiType = (typeof WIKI_TYPES)[number];

/**
 * "note" (V3.41) — frontmatter 없는 원문 markdown(`current.md`, `journal/*.md`,
 * `reports/*.md`)을 검색 가능하게 만드는 합성 type. WikiReader 가 파일에서
 * 자동 부여하며 canonical wiki citizen 이 아니다 — decay/OKF export 대상 제외,
 * search/ask 의 FTS 대상에만 포함된다.
 */

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
  /**
   * user 발화만 모은 보조 텍스트 (V3.30, optional) — 검색 시 bm25 가중으로
   * assistant/장문 노이즈 대비 user 신호를 강조. 미지정 시 랭킹 영향 0.
   */
  bodyUser?: string;
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
