import { Database } from "bun:sqlite";

export interface ComposesTriple {
  fromSkill: string;
  toSkill: string;
  depth: number;
  path: string;
}

export interface CyclePath {
  skills: string[];
  path: string;
}

export interface ComposeResult {
  triples: ComposesTriple[];
  cycles: CyclePath[];
  directEdgeCount: number;
}

/**
 * R-COMPOSE inference engine.
 *
 * Given DELEGATES_TO edges in kg_edges, computes:
 * 1. Transitive closure: A COMPOSES B if A →...→ B (any depth ≤ 10)
 * 2. Cycle detection: paths where A →...→ A
 *
 * Operates read-only on the database; does not mutate state.
 */
export class KGComposer {
  constructor(private readonly db: Database) {}

  compose(): ComposeResult {
    return {
      directEdgeCount: this._directEdgeCount(),
      triples: this._computeComposes(),
      cycles: this._detectCycles(),
    };
  }

  private _directEdgeCount(): number {
    const row = this.db
      .query(
        "SELECT COUNT(*) as c FROM kg_edges WHERE relation = 'DELEGATES_TO' AND resolved = 1",
      )
      .get() as { c: number };
    return row.c;
  }

  /**
   * Transitive closure at the skill level.
   * Returns one triple per (fromSkill, toSkill) pair with the shortest path.
   */
  private _computeComposes(): ComposesTriple[] {
    // WITH RECURSIVE builds all reachable (from, to) skill pairs.
    // UNION (not UNION ALL) deduplicates to prevent exponential blowup.
    // The NOT LIKE guard prevents revisiting intermediate nodes.
    const sql = `
      WITH RECURSIVE compose(from_skill, to_skill, depth, path) AS (
        SELECT DISTINCT from_skill, to_skill, 1,
               from_skill || ' -> ' || to_skill
        FROM kg_edges
        WHERE relation = 'DELEGATES_TO' AND resolved = 1
          AND from_skill IS NOT NULL AND to_skill IS NOT NULL
          AND from_skill != to_skill
        UNION
        SELECT c.from_skill, e.to_skill, c.depth + 1,
               c.path || ' -> ' || e.to_skill
        FROM compose c
        JOIN kg_edges e ON c.to_skill = e.from_skill
          AND e.relation = 'DELEGATES_TO' AND e.resolved = 1
          AND e.to_skill IS NOT NULL
          AND e.to_skill != c.from_skill
        WHERE c.depth < 10
          AND (' -> ' || c.path || ' -> ') NOT LIKE ('% -> ' || e.to_skill || ' -> %')
      )
      SELECT from_skill, to_skill, MIN(depth) AS depth,
             path
      FROM compose
      WHERE from_skill != to_skill
      GROUP BY from_skill, to_skill
      ORDER BY from_skill, depth, to_skill
    `;

    const rows = this.db.query(sql).all() as Array<{
      from_skill: string;
      to_skill: string;
      depth: number;
      path: string;
    }>;

    return rows.map((r) => ({
      fromSkill: r.from_skill,
      toSkill: r.to_skill,
      depth: r.depth,
      path: r.path,
    }));
  }

  /**
   * Detects cycles in the DELEGATES_TO graph.
   * Strategy: enumerate all paths (blocking revisit of intermediate nodes),
   * then find which end-nodes have an edge closing back to the start.
   * Cycles are deduplicated by canonical rotation (smallest skill slug first).
   */
  private _detectCycles(): CyclePath[] {
    const sql = `
      WITH RECURSIVE traverse(start_skill, current_skill, depth, path) AS (
        SELECT DISTINCT from_skill, to_skill, 1,
               from_skill || ',' || to_skill
        FROM kg_edges
        WHERE relation = 'DELEGATES_TO' AND resolved = 1
          AND from_skill IS NOT NULL AND to_skill IS NOT NULL
          AND from_skill != to_skill
        UNION ALL
        SELECT t.start_skill, e.to_skill, t.depth + 1,
               t.path || ',' || e.to_skill
        FROM traverse t
        JOIN kg_edges e ON t.current_skill = e.from_skill
          AND e.relation = 'DELEGATES_TO' AND e.resolved = 1
          AND e.to_skill IS NOT NULL
          AND e.to_skill != t.start_skill
        WHERE t.depth < 10
          AND (',' || t.path || ',') NOT LIKE ('%,' || e.to_skill || ',%')
      )
      SELECT DISTINCT t.start_skill,
             t.path || ',' || t.start_skill AS cycle_path
      FROM traverse t
      JOIN kg_edges closing
        ON closing.from_skill = t.current_skill
        AND closing.to_skill = t.start_skill
        AND closing.relation = 'DELEGATES_TO'
        AND closing.resolved = 1
      ORDER BY t.start_skill
    `;

    const rows = this.db.query(sql).all() as Array<{
      start_skill: string;
      cycle_path: string;
    }>;

    const seen = new Set<string>();
    const cycles: CyclePath[] = [];

    for (const row of rows) {
      // path = "A,B,C,A" — last element == first (cycle close)
      const allParts = row.cycle_path.split(",");
      // Intermediate nodes are allParts[0..n-2]; last repeats the start.
      const ring = allParts.slice(0, -1); // e.g. ["A","B","C"]
      if (ring.length === 0) continue;

      // Canonical rotation: smallest slug first
      const minIdx = ring.reduce(
        (minI, s, i) => (s < ring[minI] ? i : minI),
        0,
      );
      const rotated = [...ring.slice(minIdx), ...ring.slice(0, minIdx)];
      const key = rotated.join(",");

      if (!seen.has(key)) {
        seen.add(key);
        const skills = [...rotated, rotated[0]]; // close the ring
        cycles.push({ skills, path: skills.join(" -> ") });
      }
    }

    return cycles;
  }
}
