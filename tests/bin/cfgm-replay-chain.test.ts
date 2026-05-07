import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { buildChainReplayPlan } from "../../bin/cfgm-replay";
import { SSL_VERSION } from "../../src/core/ontology/ssl";

const KG_SCHEMA = `
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
  db.exec(KG_SCHEMA);
  return db;
}

function addDelegation(db: Database, from: string, to: string) {
  db.query(
    `INSERT OR IGNORE INTO kg_edges (from_id, to_id, relation, from_skill, to_skill, resolved)
     VALUES (?, ?, 'DELEGATES_TO', ?, ?, 1)`,
  ).run(`${from}:proto`, `${to}:sched`, from, to);
}

function minimalSSL(slug: string, skillName: string) {
  return {
    sslVersion: SSL_VERSION,
    scheduling: {
      id: `${slug}#sched`,
      skillName,
      skillGoal: `${skillName} goal`,
      intentSignature: `perform ${skillName}`,
      intentSignatures: [],
      triggerPatterns: [],
      expectedInputs: [],
      expectedOutputs: [],
      dependencies: [],
      controlFlowFeatures: [],
      warnings: [],
    },
    structural: [
      {
        id: `${slug}#act`,
        scene: "ACT",
        summary: "Do the work",
        sceneGoal: "Execute",
        containsLogicalIds: [`${slug}#log1`],
        transitionsTo: [],
      },
    ],
    logical: [
      {
        id: `${slug}#log1`,
        action: "WRITE",
        description: `Write output for ${skillName}`,
        resources: ["LOCAL_FS"],
        resourceScope: "LOCAL_FS",
        effects: [],
        warnings: [],
      },
    ],
  };
}

let tmpDir: string;
let db: Database;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "cfgm-chain-test-"));
  db = makeDb();
});

afterEach(async () => {
  db.close();
  await rm(tmpDir, { recursive: true, force: true });
});

async function writeSSL(slug: string, skillName: string) {
  await writeFile(
    join(tmpDir, `${slug}.json`),
    JSON.stringify(minimalSSL(slug, skillName)),
  );
}

describe("buildChainReplayPlan", () => {
  test("root only — no delegations — chain has single entry", async () => {
    await writeSSL("root", "Root Skill");
    const result = await buildChainReplayPlan("root", tmpDir, db);
    expect(result.chain).toHaveLength(1);
    expect(result.chain[0]!.slug).toBe("root");
    expect(result.chain[0]!.depth).toBe(0);
    expect(result.chain[0]!.delegatedBy).toBeNull();
  });

  test("root delegates to child — chain has 2 entries", async () => {
    await writeSSL("root", "Root");
    await writeSSL("child", "Child");
    addDelegation(db, "root", "child");

    const result = await buildChainReplayPlan("root", tmpDir, db);
    expect(result.chain).toHaveLength(2);
    expect(result.chain[1]!.slug).toBe("child");
    expect(result.chain[1]!.depth).toBe(1);
    expect(result.chain[1]!.delegatedBy).toBe("root");
  });

  test("two-hop chain — depth-2 grandchild included", async () => {
    await writeSSL("root", "Root");
    await writeSSL("mid", "Mid");
    await writeSSL("leaf", "Leaf");
    addDelegation(db, "root", "mid");
    addDelegation(db, "mid", "leaf");

    const result = await buildChainReplayPlan("root", tmpDir, db);
    expect(result.chain).toHaveLength(3);
    const slugs = result.chain.map((c) => c.slug);
    expect(slugs).toContain("mid");
    expect(slugs).toContain("leaf");
    const leaf = result.chain.find((c) => c.slug === "leaf")!;
    expect(leaf.depth).toBe(2);
  });

  test("unrelated skill not included in chain", async () => {
    await writeSSL("root", "Root");
    await writeSSL("other", "Other");
    addDelegation(db, "unrelated", "other");

    const result = await buildChainReplayPlan("root", tmpDir, db);
    expect(result.chain).toHaveLength(1);
    expect(result.chain.map((c) => c.slug)).not.toContain("other");
  });

  test("plan contains chain_mode frontmatter", async () => {
    await writeSSL("root", "Root");
    const result = await buildChainReplayPlan("root", tmpDir, db);
    expect(result.plan).toContain("chain_mode: true");
    expect(result.plan).toContain("replay_for: root");
  });

  test("plan contains ## Execution Order section", async () => {
    await writeSSL("root", "Root");
    await writeSSL("child", "Child");
    addDelegation(db, "root", "child");
    const result = await buildChainReplayPlan("root", tmpDir, db);
    expect(result.plan).toContain("## Execution Order");
    expect(result.plan).toContain("`root`");
    expect(result.plan).toContain("`child`");
  });

  test("missing SSL doc for child emits skip message", async () => {
    await writeSSL("root", "Root");
    // child has delegation edge but no SSL file
    addDelegation(db, "root", "ghost");
    const result = await buildChainReplayPlan("root", tmpDir, db);
    expect(result.plan).toContain("SSL document not found for");
  });
});
