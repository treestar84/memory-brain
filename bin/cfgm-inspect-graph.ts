#!/usr/bin/env bun
import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { FlowGraphStore } from "../src/core/flow/FlowGraphStore";
import { FlowGraphProjector } from "../src/core/flow/FlowGraphProjector";
import type { FlowBlock } from "../src/core/flow/types";
import { resolveStorageRoot } from "../src/hooks/bootstrap";

const storage = new FsStorage(resolveStorageRoot());
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
const filterIdx = args.indexOf("--filter");
const filter = filterIdx >= 0 ? args[filterIdx + 1] : undefined;

function applyFilter(blocks: readonly FlowBlock[]): readonly FlowBlock[] {
  if (filter === "gap") return blocks.filter((b) => b.type === "Gap");
  if (filter === "question") return blocks.filter((b) => b.type === "Question");
  return blocks;
}

async function main() {
  const deltas = await store.readDeltas(problemId);
  const graph = projector.project(problemId, deltas);
  const blocks = applyFilter(graph.blocks);

  if (format === "json") {
    console.log(JSON.stringify({ ...graph, blocks }, null, 2));
    return;
  }

  console.log(`# Flow Graph: ${problemId}`);
  console.log(`blocks: ${blocks.length}  deltas: ${deltas.length}`);
  console.log();
  for (const b of blocks) {
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
