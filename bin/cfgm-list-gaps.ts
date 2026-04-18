#!/usr/bin/env bun
import { resolve } from "node:path";
import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { QuestionQueue } from "../src/core/gap/QuestionQueue";

const PROJECT = process.env.CFGM_PROJECT || process.cwd();
const storage = new FsStorage(resolve(PROJECT, ".memory-brain"));
const queue = new QuestionQueue(storage, new RealClock());

const args = process.argv.slice(2);
const json = args.includes("--json");
const problemIdx = args.indexOf("--problem");
const problemFilter = problemIdx >= 0 ? args[problemIdx + 1] : undefined;

async function main() {
  const snap = await queue.readCurrentGaps();
  const filtered = problemFilter
    ? snap.gaps.filter((g) => g.problemId === problemFilter)
    : snap.gaps;
  if (json) {
    console.log(JSON.stringify(filtered, null, 2));
    return;
  }
  for (const g of filtered) {
    console.log(
      `${g.gapBlockId}  voi=${g.voi.toFixed(2)}  sev=${g.severity.toFixed(2)}  hasQ=${g.hasQuestion}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
