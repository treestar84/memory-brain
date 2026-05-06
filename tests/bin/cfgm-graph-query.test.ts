import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "bun:sqlite";

function cli(projectDir: string, args: string[]) {
  return spawnSync("bun", ["run", "bin/cfgm-graph-query.ts", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, CFGM_PROJECT_ROOT: projectDir },
    encoding: "utf-8",
  });
}

const CREATE_NODES = `
  CREATE TABLE IF NOT EXISTS kg_nodes (
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
  CREATE TABLE IF NOT EXISTS kg_edges (
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

async function createIndexWithData(projectDir: string): Promise<string> {
  const indexDir = join(projectDir, ".memory-brain", "indexes");
  await mkdir(indexDir, { recursive: true });
  const indexPath = join(indexDir, "search.sqlite");
  const db = new Database(indexPath, { create: true });
  db.run(CREATE_NODES);
  db.run(CREATE_EDGES);
  db.run(
    "INSERT INTO kg_nodes (node_id, node_type, skill_slug, scene, action, label, properties) VALUES ('n1','structural','ssl-test',NULL,NULL,'Test Node','{}')",
  );
  db.close();
  return indexPath;
}

describe("bin/cfgm-graph-query", () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "cfgm-graph-"));
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  test("1. 인수 없음 → exit(1)", () => {
    const result = cli(projectDir, []);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Usage");
  });

  test("2. 알 수 없는 subcommand → exit(1)", () => {
    const result = cli(projectDir, ["unknown-command"]);
    expect(result.status).toBe(1);
  });

  test("3. index 없는 경우 dangling → exit(1) + 명확한 오류 메시지", () => {
    const result = cli(projectDir, ["dangling"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("index not found");
    expect(result.stderr).toContain("cfgm-rebuild-index");
  });

  test("4. index 있는 경우 stats --json 구조 검증", async () => {
    await createIndexWithData(projectDir);
    const result = cli(projectDir, ["stats", "--json"]);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout) as {
      nodeCount: number;
      edgeCount: number;
      danglingCount: number;
      skillCount: number;
    };
    expect(typeof parsed.nodeCount).toBe("number");
    expect(typeof parsed.edgeCount).toBe("number");
    expect(typeof parsed.danglingCount).toBe("number");
    expect(typeof parsed.skillCount).toBe("number");
    expect(parsed.nodeCount).toBe(1);
  });

  test("5. node 없는 경우 → exit(1) + node not found 메시지", async () => {
    await createIndexWithData(projectDir);
    const result = cli(projectDir, ["node", "no-such-node"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("node not found");
  });

  test("6. dangling --json 빈 배열 반환 (index 있음)", async () => {
    await createIndexWithData(projectDir);
    const result = cli(projectDir, ["dangling", "--json"]);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(Array.isArray(parsed)).toBe(true);
  });
});
