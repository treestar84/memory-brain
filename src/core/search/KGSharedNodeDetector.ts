import { Database } from "bun:sqlite";
import { KGComposer } from "./KGComposer";

export interface SharedActionGroup {
  actionRef: string;
  canonicalId: string;
  skillCount: number;
  skills: string[];
  inChain: boolean;
  chainPairs: Array<{ composing: string; composed: string }>;
}

export interface DeduplicationReport {
  groups: SharedActionGroup[];
  inChainCount: number;
  crossSkillCount: number;
}

/**
 * Detects LogicalNodes sharing the same canonical actionRef across skills.
 *
 * Two modes of sharing:
 * - inChain=true:  both skills are in a COMPOSES relationship
 *   → the same action is executed twice in a single chain traversal
 * - inChain=false: skills are independent, sharing just the vocabulary term
 *
 * inChain duplicates are the candidates for elimination in cfgm-replay --chain.
 */
export class KGSharedNodeDetector {
  private readonly composesBySkill: Map<string, Set<string>>;

  constructor(private readonly db: Database) {
    this.composesBySkill = this._buildComposesIndex();
  }

  detect(): DeduplicationReport {
    const groups = this._findSharedActions();
    const inChainCount = groups.filter((g) => g.inChain).length;
    const crossSkillCount = groups.filter((g) => !g.inChain).length;
    return { groups, inChainCount, crossSkillCount };
  }

  private _buildComposesIndex(): Map<string, Set<string>> {
    const composer = new KGComposer(this.db);
    const { triples } = composer.compose();
    const index = new Map<string, Set<string>>();
    for (const t of triples) {
      if (!index.has(t.fromSkill)) index.set(t.fromSkill, new Set());
      index.get(t.fromSkill)!.add(t.toSkill);
    }
    return index;
  }

  /** Find all canonical_action nodes used by 2+ distinct skills */
  private _findSharedActions(): SharedActionGroup[] {
    const sql = `
      SELECT e.to_id AS canonical_id,
             REPLACE(e.to_id, 'canonical_action:', '') AS action_ref,
             COUNT(DISTINCT e.from_skill) AS skill_count,
             GROUP_CONCAT(DISTINCT e.from_skill ORDER BY e.from_skill) AS skills_csv
      FROM kg_edges e
      WHERE e.relation = 'INSTANTIATES'
        AND e.resolved = 1
        AND e.to_id LIKE 'canonical_action:%'
        AND e.from_skill IS NOT NULL
      GROUP BY e.to_id
      HAVING skill_count > 1
      ORDER BY skill_count DESC, action_ref
    `;

    const rows = this.db.query(sql).all() as Array<{
      canonical_id: string;
      action_ref: string;
      skill_count: number;
      skills_csv: string;
    }>;

    return rows.map((r) => {
      const skills = r.skills_csv.split(",").filter(Boolean);
      const chainPairs = this._findChainPairs(skills);
      return {
        actionRef: r.action_ref,
        canonicalId: r.canonical_id,
        skillCount: r.skill_count,
        skills,
        inChain: chainPairs.length > 0,
        chainPairs,
      };
    });
  }

  /**
   * Among a set of skills all using the same actionRef,
   * find pairs where one COMPOSES the other (i.e., chain duplicates).
   */
  private _findChainPairs(
    skills: string[],
  ): Array<{ composing: string; composed: string }> {
    const pairs: Array<{ composing: string; composed: string }> = [];
    for (let i = 0; i < skills.length; i++) {
      const a = skills[i]!;
      const aComposes = this.composesBySkill.get(a);
      if (!aComposes) continue;
      for (let j = 0; j < skills.length; j++) {
        if (i === j) continue;
        const b = skills[j]!;
        if (aComposes.has(b)) {
          pairs.push({ composing: a, composed: b });
        }
      }
    }
    return pairs;
  }
}
