#!/usr/bin/env bun
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { Database } from "bun:sqlite";
import { resolveStorageRoot } from "../src/hooks/bootstrap";
import { KGGraph } from "../src/core/search/KGGraph";

/**
 * cfgm-graph-query — KG 그래프 쿼리 CLI (PR-V3.19).
 *
 * 사용법:
 *   bun run bin/cfgm-graph-query.ts neighbors <node_id> [--relation <rel>] [--depth <n>] [--json]
 *   bun run bin/cfgm-graph-query.ts reverse-delegators <skill_slug> [--json]
 *   bun run bin/cfgm-graph-query.ts reachable <node_id> [--depth <n>] [--json]
 *   bun run bin/cfgm-graph-query.ts dangling [--json]
 *   bun run bin/cfgm-graph-query.ts stats [--json]
 *   bun run bin/cfgm-graph-query.ts node <node_id> [--json]
 *   bun run bin/cfgm-graph-query.ts skill-nodes <skill_slug> [--json]
 */

const USAGE = `
Usage:
  cfgm-graph-query neighbors <node_id> [--relation <rel>] [--depth <n>] [--json]
  cfgm-graph-query reverse-delegators <skill_slug> [--json]
  cfgm-graph-query reachable <node_id> [--depth <n>] [--json]
  cfgm-graph-query dangling [--json]
  cfgm-graph-query stats [--json]
  cfgm-graph-query node <node_id> [--json]
  cfgm-graph-query skill-nodes <skill_slug> [--json]
`.trim();

type Subcommand =
  | "neighbors"
  | "reverse-delegators"
  | "reachable"
  | "dangling"
  | "stats"
  | "node"
  | "skill-nodes";

const VALID_SUBCOMMANDS: Subcommand[] = [
  "neighbors",
  "reverse-delegators",
  "reachable",
  "dangling",
  "stats",
  "node",
  "skill-nodes",
];

interface ParsedArgs {
  subcommand: Subcommand | null;
  target: string | null;
  relation: string | null;
  depth: number;
  json: boolean;
  indexPath: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const storageRoot = resolveStorageRoot();
  const indexPath = resolve(storageRoot, "indexes/search.sqlite");

  const json = argv.includes("--json");

  const subcommand = (VALID_SUBCOMMANDS.includes(argv[0] as Subcommand)
    ? (argv[0] as Subcommand)
    : null);

  const noFlagArgs = argv.filter((a) => !a.startsWith("--"));
  const target = noFlagArgs[1] ?? null;

  let relation: string | null = null;
  const relIdx = argv.indexOf("--relation");
  if (relIdx !== -1 && argv[relIdx + 1]) {
    relation = argv[relIdx + 1];
  }

  let depth = 1;
  const depthIdx = argv.indexOf("--depth");
  if (depthIdx !== -1 && argv[depthIdx + 1]) {
    const parsed = parseInt(argv[depthIdx + 1], 10);
    if (!isNaN(parsed) && parsed > 0) depth = parsed;
  }

  return { subcommand, target, relation, depth, json, indexPath };
}

function printUsageAndExit(): never {
  console.error(USAGE);
  process.exit(1);
}

function exitWithError(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));

if (!args.subcommand) {
  printUsageAndExit();
}

if (!existsSync(args.indexPath)) {
  exitWithError(`index not found: run cfgm-rebuild-index first\n(looked for: ${args.indexPath})`);
}

const db = new Database(args.indexPath, { readonly: true });
const graph = new KGGraph(db);

switch (args.subcommand) {
  case "node": {
    if (!args.target) exitWithError("node_id required");
    const node = graph.getNode(args.target);
    if (!node) exitWithError(`node not found: ${args.target}`);
    if (args.json) {
      console.log(JSON.stringify(node, null, 2));
    } else {
      console.log(
        `[${node.nodeType}] ${node.skillSlug}  "${node.label}"` +
          (node.scene ? `  scene:${node.scene}` : "") +
          (node.action ? `  action:${node.action}` : ""),
      );
    }
    break;
  }

  case "skill-nodes": {
    if (!args.target) exitWithError("skill_slug required");
    const nodes = graph.getSkillNodes(args.target);
    if (args.json) {
      console.log(JSON.stringify(nodes, null, 2));
    } else {
      console.log(`skill-nodes of ${args.target} (${nodes.length}):`);
      for (const n of nodes) {
        console.log(`  [${n.nodeType}] ${n.nodeId}  "${n.label}"`);
      }
    }
    break;
  }

  case "neighbors": {
    if (!args.target) exitWithError("node_id required");
    const nodes = graph.neighbors(args.target, {
      relation: args.relation ?? undefined,
      direction: "out",
    });
    if (args.json) {
      console.log(JSON.stringify(nodes, null, 2));
    } else {
      console.log(`neighbors of ${args.target}:`);
      for (const n of nodes) {
        console.log(`  [${n.nodeType}] ${n.skillSlug}${n.scene ? `#scene:${n.scene}` : ""}${n.action ? `#logical:${n.action}` : ""}  "${n.label}"`);
      }
    }
    break;
  }

  case "reverse-delegators": {
    if (!args.target) exitWithError("skill_slug required");
    const delegators = graph.reverseDelegators(args.target);
    if (args.json) {
      console.log(JSON.stringify(delegators, null, 2));
    } else {
      console.log(`reverse-delegators of ${args.target}:`);
      for (const d of delegators) {
        console.log(
          `  from: ${d.fromSkill}  protocol: ${d.protocolNodeId}` +
            (d.whenCondition ? `  when: "${d.whenCondition}"` : ""),
        );
      }
    }
    break;
  }

  case "reachable": {
    if (!args.target) exitWithError("node_id required");
    const depth = args.depth === 1 ? 2 : args.depth;
    const nodes = graph.reachable(args.target, {
      maxDepth: depth,
      relation: args.relation ? [args.relation] : undefined,
    });
    if (args.json) {
      console.log(JSON.stringify(nodes, null, 2));
    } else {
      console.log(`reachable from ${args.target} (depth=${depth}, ${nodes.length} nodes):`);
      for (const n of nodes) {
        console.log(`  [${n.nodeType}] ${n.nodeId}  "${n.label}"`);
      }
    }
    break;
  }

  case "dangling": {
    const edges = graph.danglingEdges();
    if (args.json) {
      console.log(JSON.stringify(edges, null, 2));
    } else {
      console.log(`dangling edges (${edges.length}):`);
      for (const e of edges) {
        console.log(
          `  ${e.fromId} --${e.relation}--> ${e.toId} (unresolved)`,
        );
      }
    }
    break;
  }

  case "stats": {
    const s = graph.stats();
    if (args.json) {
      console.log(JSON.stringify(s, null, 2));
    } else {
      console.log(
        `stats:\n  nodes: ${s.nodeCount}  edges: ${s.edgeCount}  dangling: ${s.danglingCount}  skills: ${s.skillCount}`,
      );
    }
    break;
  }
}

db.close();
