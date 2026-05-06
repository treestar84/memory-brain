import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { KGComposer } from "../../../src/core/search/KGComposer";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS kg_edges (
    from_id TEXT NOT NULL,
    to_id TEXT NOT NULL,
    relation TEXT NOT NULL,
    from_skill TEXT NOT NULL,
    to_skill TEXT,
    resolved INTEGER NOT NULL DEFAULT 1,
    properties TEXT,
    PRIMARY KEY (from_id, to_id, relation)
  )
`;

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(SCHEMA);
  return db;
}

function addEdge(
  db: Database,
  fromSkill: string,
  toSkill: string,
  relation = "DELEGATES_TO",
  resolved = 1,
) {
  db.query(
    `INSERT OR IGNORE INTO kg_edges (from_id, to_id, relation, from_skill, to_skill, resolved)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(`${fromSkill}:proto`, `${toSkill}:sched`, relation, fromSkill, toSkill, resolved);
}

let db: Database;
beforeEach(() => { db = makeDb(); });
afterEach(() => { db.close(); });

describe("KGComposer — empty graph", () => {
  test("returns zero counts on empty graph", () => {
    const result = new KGComposer(db).compose();
    expect(result.directEdgeCount).toBe(0);
    expect(result.triples).toHaveLength(0);
    expect(result.cycles).toHaveLength(0);
  });
});

describe("KGComposer — COMPOSES triples", () => {
  test("direct delegation produces depth-1 triple", () => {
    addEdge(db, "skill-a", "skill-b");
    const { triples } = new KGComposer(db).compose();
    expect(triples).toHaveLength(1);
    expect(triples[0]).toMatchObject({ fromSkill: "skill-a", toSkill: "skill-b", depth: 1 });
  });

  test("two-hop chain produces direct + transitive triple", () => {
    addEdge(db, "skill-a", "skill-b");
    addEdge(db, "skill-b", "skill-c");
    const { triples } = new KGComposer(db).compose();
    const fromA = triples.filter((t) => t.fromSkill === "skill-a");
    expect(fromA).toHaveLength(2);
    const toC = fromA.find((t) => t.toSkill === "skill-c");
    expect(toC).toBeDefined();
    expect(toC!.depth).toBe(2);
    expect(toC!.path).toContain("skill-b");
  });

  test("three-hop chain produces all transitive triples", () => {
    addEdge(db, "a", "b");
    addEdge(db, "b", "c");
    addEdge(db, "c", "d");
    const { triples } = new KGComposer(db).compose();
    const fromA = triples.filter((t) => t.fromSkill === "a").map((t) => t.toSkill);
    expect(fromA).toContain("b");
    expect(fromA).toContain("c");
    expect(fromA).toContain("d");
  });

  test("non-DELEGATES_TO edges are ignored", () => {
    addEdge(db, "skill-a", "skill-b", "CONTAINS");
    addEdge(db, "skill-a", "skill-b", "TRANSITIONS_TO");
    const { triples, directEdgeCount } = new KGComposer(db).compose();
    expect(directEdgeCount).toBe(0);
    expect(triples).toHaveLength(0);
  });

  test("unresolved edges are ignored", () => {
    addEdge(db, "skill-a", "skill-b", "DELEGATES_TO", 0);
    const { triples, directEdgeCount } = new KGComposer(db).compose();
    expect(directEdgeCount).toBe(0);
    expect(triples).toHaveLength(0);
  });

  test("diamond A->B, A->C, B->D, C->D — A COMPOSES D once", () => {
    addEdge(db, "a", "b");
    addEdge(db, "a", "c");
    addEdge(db, "b", "d");
    addEdge(db, "c", "d");
    const { triples } = new KGComposer(db).compose();
    const aToD = triples.filter((t) => t.fromSkill === "a" && t.toSkill === "d");
    expect(aToD).toHaveLength(1);
  });
});

describe("KGComposer — cycle detection", () => {
  test("no cycles in acyclic graph", () => {
    addEdge(db, "a", "b");
    addEdge(db, "b", "c");
    const { cycles } = new KGComposer(db).compose();
    expect(cycles).toHaveLength(0);
  });

  test("self-loop filtered from delegation cycles", () => {
    addEdge(db, "a", "a");
    const { cycles } = new KGComposer(db).compose();
    expect(cycles).toHaveLength(0);
  });

  test("two-node cycle A->B->A detected", () => {
    addEdge(db, "a", "b");
    addEdge(db, "b", "a");
    const { cycles } = new KGComposer(db).compose();
    expect(cycles).toHaveLength(1);
    const c = cycles[0];
    expect(c.skills).toContain("a");
    expect(c.skills).toContain("b");
    expect(c.skills[0]).toBe(c.skills[c.skills.length - 1]);
  });

  test("three-node cycle A->B->C->A detected once", () => {
    addEdge(db, "a", "b");
    addEdge(db, "b", "c");
    addEdge(db, "c", "a");
    const { cycles } = new KGComposer(db).compose();
    expect(cycles).toHaveLength(1);
    expect(cycles[0].skills).toHaveLength(4);
  });

  test("two independent cycles reported separately", () => {
    addEdge(db, "a", "b");
    addEdge(db, "b", "a");
    addEdge(db, "c", "d");
    addEdge(db, "d", "c");
    const { cycles } = new KGComposer(db).compose();
    expect(cycles).toHaveLength(2);
  });

  test("directEdgeCount counts only resolved DELEGATES_TO", () => {
    addEdge(db, "a", "b");
    addEdge(db, "b", "c", "DELEGATES_TO", 0);
    addEdge(db, "a", "c", "CONTAINS");
    const { directEdgeCount } = new KGComposer(db).compose();
    expect(directEdgeCount).toBe(1);
  });
});
