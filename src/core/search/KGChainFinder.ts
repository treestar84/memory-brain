import { Database } from "bun:sqlite";
import { KGComposer } from "./KGComposer";

export interface ChainMember {
  slug: string;
  skillName: string;
  depth: number;
  hitScore: number; // BM25 relevance (0 = not in search hits)
}

export interface ChainCandidate {
  rootSlug: string;
  rootSkillName: string;
  chain: ChainMember[];
  maxHitScore: number;
  totalHitScore: number;
  matchedCount: number; // how many chain members hit the query
}

export interface FindChainOpts {
  limit?: number; // max hit skills from FTS5 (default 20)
  topChains?: number; // max chain candidates to return (default 5)
}

/** Converts a raw query into an FTS5-compatible prefix query. */
function buildFtsQuery(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/[^a-zA-Z0-9가-힣_-]/g, "") + "*")
    .filter(Boolean)
    .join(" ");
}

/**
 * Goal-driven skill chain discovery.
 *
 * Algorithm:
 * 1. FTS5 search ssl_skills → scored hit slugs
 * 2. Build reverse-COMPOSES index: for each slug, which roots compose it?
 * 3. For each hit, collect root candidates (self if no one composes it, else composing skills)
 * 4. For each root, build full chain and score = sum of hit relevance scores in chain
 * 5. Return top N chains by totalHitScore
 */
export class KGChainFinder {
  constructor(private readonly db: Database) {}

  findChains(goal: string, opts: FindChainOpts = {}): ChainCandidate[] {
    const limit = opts.limit ?? 20;
    const topChains = opts.topChains ?? 5;

    // Step 1: FTS5 search
    const hits = this._searchSkills(goal, limit);
    if (hits.size === 0) return [];

    // Step 2: Build COMPOSES index
    const composer = new KGComposer(this.db);
    const { triples } = composer.compose();

    // composedBy[slug] = set of skills that compose this slug
    const composedBy = new Map<string, Set<string>>();
    // composesMap[from] = [{toSkill, depth}]
    const composesMap = new Map<string, Array<{ toSkill: string; depth: number; skillName: string }>>();
    for (const t of triples) {
      if (!composedBy.has(t.toSkill)) composedBy.set(t.toSkill, new Set());
      composedBy.get(t.toSkill)!.add(t.fromSkill);

      if (!composesMap.has(t.fromSkill)) composesMap.set(t.fromSkill, []);
      composesMap.get(t.fromSkill)!.push({ toSkill: t.toSkill, depth: t.depth, skillName: "" });
    }

    // Step 3: Collect root candidates from hits
    const rootCandidates = new Set<string>();
    for (const slug of hits.keys()) {
      const composers = composedBy.get(slug);
      if (!composers || composers.size === 0) {
        rootCandidates.add(slug); // hit is itself a root
      } else {
        for (const r of composers) rootCandidates.add(r); // propagate up to roots
      }
    }

    // Also include hit slugs that ARE roots (no one composes them)
    for (const slug of hits.keys()) {
      if (!composedBy.has(slug)) rootCandidates.add(slug);
    }

    // Step 4: Build and score chains
    const skillNames = this._loadSkillNames();
    const candidates: ChainCandidate[] = [];

    for (const root of rootCandidates) {
      const chainMembers: ChainMember[] = [
        {
          slug: root,
          skillName: skillNames.get(root) ?? root,
          depth: 0,
          hitScore: Math.abs(hits.get(root) ?? 0),
        },
      ];

      const composed = composesMap.get(root) ?? [];
      for (const c of composed.sort((a, b) => a.depth - b.depth)) {
        chainMembers.push({
          slug: c.toSkill,
          skillName: skillNames.get(c.toSkill) ?? c.toSkill,
          depth: c.depth,
          hitScore: Math.abs(hits.get(c.toSkill) ?? 0),
        });
      }

      const hitMembers = chainMembers.filter((m) => m.hitScore > 0);
      if (hitMembers.length === 0) continue; // chain has no relevance to goal

      const totalHitScore = hitMembers.reduce((s, m) => s + m.hitScore, 0);
      const maxHitScore = Math.max(...hitMembers.map((m) => m.hitScore));

      candidates.push({
        rootSlug: root,
        rootSkillName: skillNames.get(root) ?? root,
        chain: chainMembers,
        maxHitScore,
        totalHitScore,
        matchedCount: hitMembers.length,
      });
    }

    // Step 5: Sort by totalHitScore desc, return top N
    candidates.sort((a, b) => b.totalHitScore - a.totalHitScore || b.matchedCount - a.matchedCount);
    return candidates.slice(0, topChains);
  }

  /** FTS5 search — returns Map<slug, bm25Score> (score is negative). */
  private _searchSkills(query: string, limit: number): Map<string, number> {
    const ftsQuery = buildFtsQuery(query);
    if (!ftsQuery) return new Map();

    // BM25 weights matching SearchIndex: scheduling=3.0, structural=1.5, logical=1.0
    const sql = `
      SELECT skill_slug,
             bm25(ssl_skills, 0, 0, 0, 0, 3.0, 1.5, 1.0) AS score
      FROM ssl_skills
      WHERE ssl_skills MATCH ?
      ORDER BY score
      LIMIT ?
    `;

    let rows: Array<{ skill_slug: string; score: number }>;
    try {
      rows = this.db.query(sql).all(ftsQuery, limit) as typeof rows;
    } catch {
      return new Map(); // FTS5 table not yet populated
    }

    return new Map(rows.map((r) => [r.skill_slug, r.score]));
  }

  /** Load skill_slug → skill_name mapping from ssl_skills. */
  private _loadSkillNames(): Map<string, string> {
    let rows: Array<{ skill_slug: string; skill_name: string }>;
    try {
      rows = this.db
        .query("SELECT DISTINCT skill_slug, skill_name FROM ssl_skills")
        .all() as typeof rows;
    } catch {
      return new Map();
    }
    return new Map(rows.map((r) => [r.skill_slug, r.skill_name]));
  }
}
