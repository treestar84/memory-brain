import { Database } from "bun:sqlite";

export interface KGNode {
  nodeId: string;
  nodeType: string;
  skillSlug: string;
  scene?: string;
  action?: string;
  label: string;
  properties: unknown;
}

export interface KGEdge {
  fromId: string;
  toId: string;
  relation: string;
  fromSkill: string;
  toSkill: string | null;
  resolved: boolean;
  properties?: unknown;
}

export interface NeighborOpts {
  relation?: string | string[];
  direction?: "out" | "in" | "both";
  maxDepth?: number;
  includeUnresolved?: boolean;
  limit?: number;
}

function safeJsonParse(s: string | null | undefined): unknown {
  if (!s) return {};
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

function rowToNode(r: {
  node_id: string;
  node_type: string;
  skill_slug: string;
  scene: string | null;
  action: string | null;
  label: string;
  properties: string;
}): KGNode {
  return {
    nodeId: r.node_id,
    nodeType: r.node_type,
    skillSlug: r.skill_slug,
    scene: r.scene ?? undefined,
    action: r.action ?? undefined,
    label: r.label,
    properties: safeJsonParse(r.properties),
  };
}

function rowToEdge(r: {
  from_id: string;
  to_id: string;
  relation: string;
  from_skill: string;
  to_skill: string | null;
  resolved: number;
  properties: string | null;
}): KGEdge {
  return {
    fromId: r.from_id,
    toId: r.to_id,
    relation: r.relation,
    fromSkill: r.from_skill,
    toSkill: r.to_skill,
    resolved: r.resolved !== 0,
    properties: safeJsonParse(r.properties),
  };
}

export class KGGraph {
  constructor(private readonly db: Database) {}

  /** 단일 노드 조회 */
  getNode(nodeId: string): KGNode | null {
    const row = this.db
      .query("SELECT * FROM kg_nodes WHERE node_id = ?")
      .get(nodeId) as Parameters<typeof rowToNode>[0] | null;
    return row ? rowToNode(row) : null;
  }

  /** 특정 skill의 모든 노드 */
  getSkillNodes(slug: string): KGNode[] {
    const rows = this.db
      .query("SELECT * FROM kg_nodes WHERE skill_slug = ?")
      .all(slug) as Parameters<typeof rowToNode>[0][];
    return rows.map(rowToNode);
  }

  /** 인접 노드 조회 (1-hop 기본) */
  neighbors(nodeId: string, opts: NeighborOpts = {}): KGNode[] {
    const direction = opts.direction ?? "out";
    const includeUnresolved = opts.includeUnresolved ?? false;
    const limit = opts.limit ?? 100;
    const relations = opts.relation
      ? Array.isArray(opts.relation)
        ? opts.relation
        : [opts.relation]
      : null;

    const resolvedClause = includeUnresolved ? "" : "AND e.resolved = 1";
    const relClause =
      relations && relations.length > 0
        ? `AND e.relation IN (${relations.map(() => "?").join(",")})`
        : "";

    let sql: string;
    if (direction === "out") {
      sql = `SELECT n.* FROM kg_nodes n
             JOIN kg_edges e ON e.to_id = n.node_id
             WHERE e.from_id = ? ${resolvedClause} ${relClause}
             LIMIT ?`;
    } else if (direction === "in") {
      sql = `SELECT n.* FROM kg_nodes n
             JOIN kg_edges e ON e.from_id = n.node_id
             WHERE e.to_id = ? ${resolvedClause} ${relClause}
             LIMIT ?`;
    } else {
      // both
      sql = `SELECT DISTINCT n.* FROM kg_nodes n
             JOIN kg_edges e ON (e.to_id = n.node_id AND e.from_id = ?)
                             OR (e.from_id = n.node_id AND e.to_id = ?)
             WHERE 1=1 ${resolvedClause} ${relClause}
             LIMIT ?`;
    }

    let params: (string | number)[];
    if (direction === "both") {
      params = [nodeId, nodeId, ...(relations ?? []), limit];
    } else {
      params = [nodeId, ...(relations ?? []), limit];
    }

    const rows = this.db.query(sql).all(...params) as Parameters<typeof rowToNode>[0][];
    return rows.map(rowToNode);
  }

  /** 인접 엣지 조회 */
  edges(nodeId: string, opts: NeighborOpts = {}): KGEdge[] {
    const direction = opts.direction ?? "out";
    const includeUnresolved = opts.includeUnresolved ?? false;
    const limit = opts.limit ?? 100;
    const relations = opts.relation
      ? Array.isArray(opts.relation)
        ? opts.relation
        : [opts.relation]
      : null;

    const resolvedClause = includeUnresolved ? "" : "AND resolved = 1";
    const relClause =
      relations && relations.length > 0
        ? `AND relation IN (${relations.map(() => "?").join(",")})`
        : "";

    let sql: string;
    let params: (string | number)[];

    if (direction === "out") {
      sql = `SELECT * FROM kg_edges WHERE from_id = ? ${resolvedClause} ${relClause} LIMIT ?`;
      params = [nodeId, ...(relations ?? []), limit];
    } else if (direction === "in") {
      sql = `SELECT * FROM kg_edges WHERE to_id = ? ${resolvedClause} ${relClause} LIMIT ?`;
      params = [nodeId, ...(relations ?? []), limit];
    } else {
      sql = `SELECT * FROM kg_edges WHERE (from_id = ? OR to_id = ?) ${resolvedClause} ${relClause} LIMIT ?`;
      params = [nodeId, nodeId, ...(relations ?? []), limit];
    }

    const rows = this.db.query(sql).all(...params) as Parameters<typeof rowToEdge>[0][];
    return rows.map(rowToEdge);
  }

  /** 역방향 위임자 — "이 skill을 delegateTo하는 모든 skill" */
  reverseDelegators(
    toSkillSlug: string,
  ): Array<{ fromSkill: string; protocolNodeId: string; whenCondition?: string }> {
    const sql = `
      SELECT e.from_id as protocol_node_id, e.from_skill, e.properties
      FROM kg_edges e
      WHERE e.relation = 'DELEGATES_TO'
        AND e.to_skill = ?
        AND e.resolved = 1
    `;
    const rows = this.db.query(sql).all(toSkillSlug) as Array<{
      protocol_node_id: string;
      from_skill: string;
      properties: string | null;
    }>;

    return rows.map((r) => {
      const props = safeJsonParse(r.properties) as Record<string, unknown>;
      const whenCondition =
        typeof props.when === "string" ? props.when : undefined;
      return {
        fromSkill: r.from_skill,
        protocolNodeId: r.protocol_node_id,
        whenCondition,
      };
    });
  }

  /** N홉 도달 가능 노드 — 재귀 CTE */
  reachable(
    fromNodeId: string,
    opts: { maxDepth: number; relation?: string[]; limit?: number },
  ): KGNode[] {
    const maxDepth = opts.maxDepth;
    const limit = opts.limit ?? 200;
    const relations = opts.relation && opts.relation.length > 0 ? opts.relation : null;

    const relClause = relations
      ? `AND e.relation IN (${relations.map(() => "?").join(",")})`
      : "";

    const sql = `
      WITH RECURSIVE chain(node_id, depth) AS (
        SELECT ?, 0
        UNION ALL
        SELECT e.to_id, c.depth + 1
        FROM kg_edges e
        JOIN chain c ON e.from_id = c.node_id
        WHERE c.depth < ?
          AND e.resolved = 1
          ${relClause}
      )
      SELECT DISTINCT n.* FROM chain c
      JOIN kg_nodes n ON n.node_id = c.node_id
      WHERE c.node_id != ?
      LIMIT ?
    `;

    const params: (string | number)[] = [
      fromNodeId,
      maxDepth,
      ...(relations ?? []),
      fromNodeId,
      limit,
    ];

    const rows = this.db.query(sql).all(...params) as Parameters<typeof rowToNode>[0][];
    return rows.map(rowToNode);
  }

  /** dangling 엣지 목록 (governance용) */
  danglingEdges(): KGEdge[] {
    const rows = this.db
      .query("SELECT * FROM kg_edges WHERE resolved = 0")
      .all() as Parameters<typeof rowToEdge>[0][];
    return rows.map(rowToEdge);
  }

  /** 전체 통계 */
  stats(): { nodeCount: number; edgeCount: number; danglingCount: number; skillCount: number } {
    const nodeRow = this.db.query("SELECT COUNT(*) as c FROM kg_nodes").get() as { c: number };
    const edgeRow = this.db.query("SELECT COUNT(*) as c FROM kg_edges").get() as { c: number };
    const danglingRow = this.db
      .query("SELECT COUNT(*) as c FROM kg_edges WHERE resolved = 0")
      .get() as { c: number };
    const skillRow = this.db
      .query("SELECT COUNT(DISTINCT skill_slug) as c FROM kg_nodes")
      .get() as { c: number };
    return {
      nodeCount: nodeRow.c,
      edgeCount: edgeRow.c,
      danglingCount: danglingRow.c,
      skillCount: skillRow.c,
    };
  }
}
