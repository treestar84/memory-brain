/**
 * Search Layer 도메인 타입 (PR-V3.6, vision §5.7).
 *
 * derived index — markdown source 에서 rebuild 가능한 파생물.
 * source-of-truth 는 markdown + jsonl 이며 본 index 는 검색 가속 용도만.
 */

export interface WikiSearchHit {
  pageId: string;
  pagePath: string;
  type: string;
  status: string;
  /** FTS rank 점수 (낮을수록 관련성↑, BM25 음수) */
  rank: number;
  /** 매칭 snippet — body 의 일부 */
  snippet: string;
}

export interface ClaimSearchHit {
  candidateId: string;
  proposedType: string;
  proposedText: string;
  status: string;
  rank: number;
  snippet: string;
}

export interface WikiSearchOpts {
  type?: string;
  status?: string;
  limit?: number;
}

export interface ClaimSearchOpts {
  status?: string;
  limit?: number;
}

export interface RebuildResult {
  wikiCount: number;
  claimCount: number;
  skillCount?: number;
  nodeCount: number;
  edgeCount: number;
  danglingEdgeCount: number;
  durationMs: number;
}

/**
 * SSL Skill discovery hit (PR-V3.14, paper arXiv 2604.24026 §4.1).
 *
 * Rich-field weighted retrieval — Scheduling fields (intent_signature,
 * triggers, skill_name) carry highest weight, Structural (scene names +
 * summaries) middle, Logical (actions + resource scopes + descriptions)
 * support. Paper reports MRR 0.573 → 0.707 with this weighting.
 */
export interface SkillSearchHit {
  skillSlug: string;
  skillName: string;
  sourcePath: string;
  /** FTS5 BM25 score (negative; lower = more relevant) */
  rank: number;
  intentSignature: string;
}

export interface SkillSearchOpts {
  limit?: number;
}
