#!/usr/bin/env bun
import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { ObservationBundler } from "../src/core/flow/ObservationBundler";
import { resolveStorageRoot } from "../src/hooks/bootstrap";

const storage = new FsStorage(resolveStorageRoot());
const clock = new RealClock();
const bundler = new ObservationBundler(storage, clock);

const args = process.argv.slice(2);
const unprocessed = args.includes("--unprocessed");
const json = args.includes("--json");
const problemIdx = args.indexOf("--problem");
const problemId = problemIdx >= 0 ? args[problemIdx + 1] : undefined;

async function main() {
  if (!unprocessed) {
    console.error("Only --unprocessed is supported");
    process.exit(1);
  }
  const list = await bundler.listUnprocessed(problemId);
  if (json) {
    console.log(JSON.stringify(
      list.map((b) => ({
        bundleId: b.bundleId,
        activeProblemId: b.activeProblemId,
        sessionId: b.sessionId,
        turnOrdinal: b.turnOrdinal,
        sealedAt: b.sealedAt,
        eventCount: b.observations.length,
      })),
      null,
      2,
    ));
  } else {
    for (const b of list) {
      console.log(`${b.bundleId}  problem=${b.activeProblemId ?? "orphan"}  events=${b.observations.length}  ${b.sealedAt}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
