#!/usr/bin/env bun
import { resolve } from "node:path";
import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { FlowGraphStore } from "../src/core/flow/FlowGraphStore";
import { FlowGraphProjector } from "../src/core/flow/FlowGraphProjector";

const PROJECT = process.env.CFGM_PROJECT || process.cwd();
const storage = new FsStorage(resolve(PROJECT, ".memory-brain"));
const store = new FlowGraphStore(storage, new RealClock());
const projector = new FlowGraphProjector();

const args = process.argv.slice(2);
const problemIdx = args.indexOf("--problem");
if (problemIdx < 0) {
  console.error("--problem <id> required");
  process.exit(1);
}
const problemId = args[problemIdx + 1];
const formatIdx = args.indexOf("--format");
const format = formatIdx >= 0 ? args[formatIdx + 1] : "md";

async function main() {
  const deltas = await store.readDeltas(problemId);
  const graph = projector.project(problemId, deltas);

  if (format === "json") {
    console.log(JSON.stringify(graph, null, 2));
    return;
  }

  console.log(`# Flow Graph: ${problemId}`);
  console.log(`blocks: ${graph.blocks.length}  deltas: ${deltas.length}`);
  console.log();
  for (const b of graph.blocks) {
    console.log(`## ${b.type} ${b.blockId} (${b.status}, c=${b.confidence})`);
    console.log(b.label);
    if (b.relations.length > 0) {
      for (const r of b.relations) {
        console.log(`  → ${r.kind} ${r.targetBlockId} (${r.confidence})`);
      }
    }
    console.log();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
