import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { KGGraph } from "../../../src/core/search/KGGraph";

const CREATE_NODES = `
  CREATE TABLE kg_nodes (
    node_id    TEXT PRIMARY KEY,
    node_type  TEXT NOT NULL,
    skill_slug TEXT NOT NULL,
    scene      TEXT,
    action     TEXT,
    label      TEXT NOT NULL,
    properties TEXT NOT NULL
  )
`;

const CREATE_EDGES = `
  CREATE TABLE kg_edges (
    from_id    TEXT NOT NULL,
    to_id      TEXT NOT NULL,
    relation   TEXT NOT NULL,
    from_skill TEXT NOT NULL,
    to_skill   TEXT,
    resolved   INTEGER NOT NULL DEFAULT 1,
    properties TEXT,
    PRIMARY KEY (from_id, to_id, relation)
  )
`;

function buildDb(): Database {
  const db = new Database(":memory:");
  db.run(CREATE_NODES);
  db.run(CREATE_EDGES);

  // Nodes: A --CONTAINS--> B --TRANSITIONS_TO--> C
  //        A --DELEGATES_TO--> D (from_skill=ssl-a, to_skill=ssl-d)
  //        E (dangling target, not in nodes)
  const insNode = db.prepare(
    "INSERT INTO kg_nodes (node_id, node_type, skill_slug, scene, action, label, properties) VALUES (?,?,?,?,?,?,?)",
  );
  insNode.run("node-a", "structural", "ssl-a", "PREPARE", null, "Node A", '{"key":"val"}');
  insNode.run("node-b", "logical", "ssl-a", null, "READ", "Node B", "{}");
  insNode.run("node-c", "scheduling", "ssl-b", null, null, "Node C", "{}");
  insNode.run("node-d", "protocol", "ssl-d", null, null, "Node D", "{}");
  insNode.run("node-e", "structural", "ssl-c", "MAIN", null, "Node E", "{}");

  const insEdge = db.prepare(
    "INSERT INTO kg_edges (from_id, to_id, relation, from_skill, to_skill, resolved, properties) VALUES (?,?,?,?,?,?,?)",
  );
  // resolved edges
  insEdge.run("node-a", "node-b", "CONTAINS", "ssl-a", "ssl-a", 1, null);
  insEdge.run("node-b", "node-c", "TRANSITIONS_TO", "ssl-a", "ssl-b", 1, null);
  // DELEGATES_TO edge for reverseDelegators
  insEdge.run("node-a", "node-d", "DELEGATES_TO", "ssl-a", "ssl-d", 1, '{"when":"job done"}');
  // dangling edge (resolved=0)
  insEdge.run("node-e", "nonexistent", "DELEGATES_TO", "ssl-c", "ssl-x", 0, null);

  return db;
}

describe("KGGraph", () => {
  let db: Database;
  let graph: KGGraph;

  beforeEach(() => {
    db = buildDb();
    graph = new KGGraph(db);
  });

  test("1. getNode: 존재하는 노드 반환", () => {
    const node = graph.getNode("node-a");
    expect(node).not.toBeNull();
    expect(node!.nodeId).toBe("node-a");
    expect(node!.nodeType).toBe("structural");
    expect(node!.skillSlug).toBe("ssl-a");
    expect(node!.scene).toBe("PREPARE");
    expect(node!.label).toBe("Node A");
    expect(node!.properties).toEqual({ key: "val" });
  });

  test("2. getNode: 없는 노드 → null", () => {
    const node = graph.getNode("does-not-exist");
    expect(node).toBeNull();
  });

  test("3. neighbors: out 방향 1홉", () => {
    // node-a --CONTAINS--> node-b, --DELEGATES_TO--> node-d
    const ns = graph.neighbors("node-a", { direction: "out" });
    const ids = ns.map((n) => n.nodeId).sort();
    expect(ids).toContain("node-b");
    expect(ids).toContain("node-d");
    expect(ids).not.toContain("node-a");
  });

  test("4. neighbors: in 방향 1홉", () => {
    // node-b is pointed to by node-a (CONTAINS)
    const ns = graph.neighbors("node-b", { direction: "in" });
    const ids = ns.map((n) => n.nodeId);
    expect(ids).toContain("node-a");
    expect(ids).not.toContain("node-c");
  });

  test("5. neighbors: relation 필터", () => {
    // node-a has CONTAINS and DELEGATES_TO out edges
    const ns = graph.neighbors("node-a", { relation: "CONTAINS", direction: "out" });
    expect(ns).toHaveLength(1);
    expect(ns[0].nodeId).toBe("node-b");
  });

  test("6. reverseDelegators: DELEGATES_TO 역방향 쿼리", () => {
    const delegators = graph.reverseDelegators("ssl-d");
    expect(delegators).toHaveLength(1);
    expect(delegators[0].fromSkill).toBe("ssl-a");
    expect(delegators[0].protocolNodeId).toBe("node-a");
    expect(delegators[0].whenCondition).toBe("job done");
  });

  test("7. reachable: 2홉 도달 가능성", () => {
    // node-a -> node-b (CONTAINS) -> node-c (TRANSITIONS_TO) = 2 hops
    const nodes = graph.reachable("node-a", { maxDepth: 2 });
    const ids = nodes.map((n) => n.nodeId);
    expect(ids).toContain("node-b");
    expect(ids).toContain("node-c");
    // start node excluded
    expect(ids).not.toContain("node-a");
  });

  test("8. reachable: 순환 처리 (같은 노드 중복 없음)", () => {
    // Add a cycle: node-c -> node-a
    db.run(
      "INSERT OR IGNORE INTO kg_edges (from_id, to_id, relation, from_skill, to_skill, resolved) VALUES ('node-c','node-a','REFERENCES_EVIDENCE','ssl-b','ssl-a',1)",
    );
    const nodes = graph.reachable("node-a", { maxDepth: 5 });
    const ids = nodes.map((n) => n.nodeId);
    // DISTINCT ensures no duplicates
    const unique = new Set(ids);
    expect(ids.length).toBe(unique.size);
  });

  test("9. danglingEdges: resolved=0인 엣지만 반환", () => {
    const dangling = graph.danglingEdges();
    expect(dangling).toHaveLength(1);
    expect(dangling[0].fromId).toBe("node-e");
    expect(dangling[0].toId).toBe("nonexistent");
    expect(dangling[0].resolved).toBe(false);
  });

  test("10. stats: 집계 정확성", () => {
    const s = graph.stats();
    expect(s.nodeCount).toBe(5);
    expect(s.edgeCount).toBe(4);
    expect(s.danglingCount).toBe(1);
    expect(s.skillCount).toBe(4); // ssl-a, ssl-b, ssl-c, ssl-d
  });
});
