import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { KGSharedNodeDetector } from "../../../src/core/search/KGSharedNodeDetector";

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

function addInstantiates(db: Database, fromSkill: string, actionRef: string) {
  const canonicalId = `canonical_action:${actionRef}`;
  db.query(
    `INSERT OR IGNORE INTO kg_edges (from_id, to_id, relation, from_skill, to_skill, resolved)
     VALUES (?, ?, 'INSTANTIATES', ?, NULL, 1)`,
  ).run(`${fromSkill}:log`, canonicalId, fromSkill);
}

function addDelegation(db: Database, from: string, to: string) {
  db.query(
    `INSERT OR IGNORE INTO kg_edges (from_id, to_id, relation, from_skill, to_skill, resolved)
     VALUES (?, ?, 'DELEGATES_TO', ?, ?, 1)`,
  ).run(`${from}:proto`, `${to}:sched`, from, to);
}

let db: Database;
beforeEach(() => { db = makeDb(); });
afterEach(() => { db.close(); });

describe("KGSharedNodeDetector — empty graph", () => {
  test("empty graph returns empty report", () => {
    const report = new KGSharedNodeDetector(db).detect();
    expect(report.groups).toHaveLength(0);
    expect(report.inChainCount).toBe(0);
    expect(report.crossSkillCount).toBe(0);
  });
});

describe("KGSharedNodeDetector — shared actions", () => {
  test("single skill using action — not shared", () => {
    addInstantiates(db, "skill-a", "READ_LOCAL_FILE");
    const report = new KGSharedNodeDetector(db).detect();
    expect(report.groups).toHaveLength(0);
  });

  test("two skills sharing action, no delegation — crossSkill not inChain", () => {
    addInstantiates(db, "skill-a", "READ_LOCAL_FILE");
    addInstantiates(db, "skill-b", "READ_LOCAL_FILE");
    const report = new KGSharedNodeDetector(db).detect();
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0]!.inChain).toBe(false);
    expect(report.crossSkillCount).toBe(1);
    expect(report.inChainCount).toBe(0);
  });

  test("two skills sharing action with delegation — inChain duplicate detected", () => {
    addInstantiates(db, "root", "READ_LOCAL_FILE");
    addInstantiates(db, "child", "READ_LOCAL_FILE");
    addDelegation(db, "root", "child");

    const report = new KGSharedNodeDetector(db).detect();
    expect(report.groups).toHaveLength(1);
    const g = report.groups[0]!;
    expect(g.inChain).toBe(true);
    expect(g.chainPairs).toHaveLength(1);
    expect(g.chainPairs[0]!.composing).toBe("root");
    expect(g.chainPairs[0]!.composed).toBe("child");
    expect(report.inChainCount).toBe(1);
  });

  test("three-hop chain: root, mid, leaf all share action — all in-chain pairs found", () => {
    addInstantiates(db, "root", "WRITE");
    addInstantiates(db, "mid", "WRITE");
    addInstantiates(db, "leaf", "WRITE");
    addDelegation(db, "root", "mid");
    addDelegation(db, "mid", "leaf");

    const report = new KGSharedNodeDetector(db).detect();
    const g = report.groups[0]!;
    expect(g.inChain).toBe(true);
    // root composes mid + leaf, mid composes leaf
    expect(g.chainPairs.length).toBeGreaterThanOrEqual(2);
  });

  test("two different actions shared independently — two groups", () => {
    addInstantiates(db, "a", "READ_LOCAL_FILE");
    addInstantiates(db, "b", "READ_LOCAL_FILE");
    addInstantiates(db, "a", "WRITE");
    addInstantiates(db, "c", "WRITE");

    const report = new KGSharedNodeDetector(db).detect();
    expect(report.groups).toHaveLength(2);
  });

  test("skillCount matches number of distinct skills", () => {
    addInstantiates(db, "x", "INFER");
    addInstantiates(db, "y", "INFER");
    addInstantiates(db, "z", "INFER");
    const report = new KGSharedNodeDetector(db).detect();
    expect(report.groups[0]!.skillCount).toBe(3);
    expect(report.groups[0]!.skills).toHaveLength(3);
  });

  test("skills array contains all skill slugs", () => {
    addInstantiates(db, "alpha", "EMIT");
    addInstantiates(db, "beta", "EMIT");
    const { groups } = new KGSharedNodeDetector(db).detect();
    expect(groups[0]!.skills).toContain("alpha");
    expect(groups[0]!.skills).toContain("beta");
  });
});
