import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { KGChainFinder } from "../../../src/core/search/KGChainFinder";

// Minimal schema: ssl_skills FTS5 + kg_edges
const SCHEMA = `
  CREATE VIRTUAL TABLE IF NOT EXISTS ssl_skills USING fts5(
    skill_slug UNINDEXED,
    skill_name UNINDEXED,
    source_path UNINDEXED,
    intent_signature UNINDEXED,
    scheduling_text,
    structural_text,
    logical_text,
    tokenize='unicode61'
  );
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

function addSkill(db: Database, slug: string, name: string, schedulingText: string, logicalText = "") {
  db.query(
    `INSERT INTO ssl_skills (skill_slug, skill_name, source_path, intent_signature, scheduling_text, structural_text, logical_text)
     VALUES (?, ?, ?, ?, ?, '', ?)`,
  ).run(slug, name, `skills/${slug}.md`, `perform ${name}`, schedulingText, logicalText);
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

describe("KGChainFinder — empty", () => {
  test("no skills returns empty array", () => {
    const result = new KGChainFinder(db).findChains("ssl normalize");
    expect(result).toHaveLength(0);
  });

  test("no match returns empty array", () => {
    addSkill(db, "skill-a", "Skill A", "completely unrelated task");
    const result = new KGChainFinder(db).findChains("xyz banana");
    expect(result).toHaveLength(0);
  });

  test("non-Latin/non-Hangul query (Japanese) does not throw FTS5 syntax error", () => {
    addSkill(db, "skill-a", "Skill A", "completely unrelated task");
    expect(() => new KGChainFinder(db).findChains("こんにちは")).not.toThrow();
    expect(new KGChainFinder(db).findChains("こんにちは")).toHaveLength(0);
  });

  test("emoji-only query does not throw FTS5 syntax error", () => {
    addSkill(db, "skill-a", "Skill A", "completely unrelated task");
    expect(() => new KGChainFinder(db).findChains("🎉🚀")).not.toThrow();
    expect(new KGChainFinder(db).findChains("🎉🚀")).toHaveLength(0);
  });

  test("mixed Latin + emoji query still matches on the Latin token", () => {
    addSkill(db, "normalize", "SSL Normalizer", "ssl normalize workflow knowledge graph");
    const result = new KGChainFinder(db).findChains("normalize 🎉");
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.rootSlug).toBe("normalize");
  });
});

describe("KGChainFinder — single skill", () => {
  test("single skill matching goal — chain with one member", () => {
    addSkill(db, "normalize", "SSL Normalizer", "ssl normalize workflow knowledge graph");
    const result = new KGChainFinder(db).findChains("ssl normalize");
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.rootSlug).toBe("normalize");
    expect(result[0]!.chain).toHaveLength(1);
    expect(result[0]!.matchedCount).toBe(1);
  });
});

describe("KGChainFinder — chain discovery", () => {
  test("root matching goal with delegated child — chain includes both", () => {
    addSkill(db, "root", "Root Skill", "orchestrate ssl normalize rebuild index");
    addSkill(db, "child", "Child Skill", "rebuild search index ssl");
    addDelegation(db, "root", "child");

    const result = new KGChainFinder(db).findChains("ssl normalize");
    expect(result.length).toBeGreaterThan(0);
    const top = result[0]!;
    expect(top.chain.map((m) => m.slug)).toContain("child");
    expect(top.matchedCount).toBeGreaterThan(0);
  });

  test("child matching goal — root is surfaced as chain start", () => {
    addSkill(db, "root", "Root", "orchestrate pipeline");
    addSkill(db, "child", "Child SSL", "ssl knowledge graph normalize");
    addDelegation(db, "root", "child");

    const result = new KGChainFinder(db).findChains("ssl normalize");
    expect(result.length).toBeGreaterThan(0);
    // root should appear as the chain start
    const slugs = result.map((c) => c.rootSlug);
    expect(slugs).toContain("root");
  });

  test("topChains option limits results", () => {
    for (let i = 0; i < 6; i++) {
      addSkill(db, `skill-${i}`, `Skill ${i}`, `ssl normalize task ${i}`);
    }
    const result = new KGChainFinder(db).findChains("ssl normalize", { topChains: 3 });
    expect(result.length).toBeLessThanOrEqual(3);
  });

  test("chain members have correct depth", () => {
    addSkill(db, "a", "A", "ssl normalize");
    addSkill(db, "b", "B", "ssl normalize rebuild");
    addSkill(db, "c", "C", "ssl normalize index");
    addDelegation(db, "a", "b");
    addDelegation(db, "b", "c");

    const result = new KGChainFinder(db).findChains("ssl normalize");
    const chainA = result.find((r) => r.rootSlug === "a");
    expect(chainA).toBeDefined();
    const memberC = chainA!.chain.find((m) => m.slug === "c");
    expect(memberC).toBeDefined();
    expect(memberC!.depth).toBe(2);
  });

  test("totalHitScore is sum of hit member scores", () => {
    addSkill(db, "skill-x", "X", "ssl normalize");
    const result = new KGChainFinder(db).findChains("ssl normalize");
    if (result.length > 0) {
      const c = result[0]!;
      const expectedTotal = c.chain.reduce((s, m) => s + m.hitScore, 0);
      expect(c.totalHitScore).toBeCloseTo(expectedTotal, 5);
    }
  });
});
