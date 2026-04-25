#!/usr/bin/env bun
import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { FlowGraphStore } from "../src/core/flow/FlowGraphStore";
import { FlowGraphValidator } from "../src/core/flow/FlowGraphValidator";
import { FlowGraphProjector } from "../src/core/flow/FlowGraphProjector";
import { ObservationBundler } from "../src/core/flow/ObservationBundler";
import { QuestionQueue } from "../src/core/gap/QuestionQueue";
import type { FlowDelta } from "../src/core/flow/types";
import { resolveStorageRoot } from "../src/hooks/bootstrap";
import { ContentHasher } from "../src/core/dedup/ContentHasher";
import { DedupIndex } from "../src/core/dedup/DedupIndex";

const storage = new FsStorage(resolveStorageRoot());
const clock = new RealClock();
const store = new FlowGraphStore(storage, clock);
const validator = new FlowGraphValidator();
const projector = new FlowGraphProjector();
const bundler = new ObservationBundler(storage, clock);
const questionQueue = new QuestionQueue(storage, clock);
const hasher = new ContentHasher();
const dedupIndex = new DedupIndex(store, storage, clock, hasher);
const dedupEnabled = !process.env.CFGM_DEDUP_DISABLED;

const args = process.argv.slice(2);
const markProcessedIdx = args.indexOf("--mark-processed");
const VERSION = "claude-code@1.0.0";

function deltaProblemId(d: FlowDelta): string {
  switch (d.op) {
    case "block-add":
      return d.block.problemId;
    case "block-supersede":
    case "relation-add":
    case "cue-card-regen":
      return d.problemId;
  }
}

async function main() {
  if (markProcessedIdx >= 0) {
    const bundleId = args[markProcessedIdx + 1];
    if (!bundleId) {
      console.error("--mark-processed requires a bundleId");
      process.exit(1);
    }
    await bundler.markProcessed(bundleId, VERSION);
    console.log(`marked ${bundleId}`);
    return;
  }

  const input = await Bun.stdin.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`JSON parse error: ${msg}`);
    process.exit(1);
  }

  const deltas: FlowDelta[] = Array.isArray(parsed)
    ? (parsed as FlowDelta[])
    : [parsed as FlowDelta];

  const problemsTouched = new Set<string>();
  let applied = 0;
  let failed = 0;

  for (const d of deltas) {
    const res = validator.validateDelta(d);
    if (!res.ok) {
      console.error(`delta rejected: ${res.reason}`);
      failed++;
      continue;
    }
    if (dedupEnabled && d.op === "block-add") {
      const { problemId, type, label, blockId } = d.block;
      if (await dedupIndex.has(problemId, type, label)) {
        await dedupIndex.logSkip({
          problemId,
          hash: hasher.hash(type, label),
          attemptedBlockId: blockId,
          type,
          reason: "duplicate-type-label",
        });
        console.error(`delta skipped (dedup): ${type}:${label.slice(0, 24)} ${blockId}`);
        continue;
      }
    }
    const problemId = deltaProblemId(d);
    await store.appendDelta(problemId, d);
    problemsTouched.add(problemId);
    applied++;
  }

  for (const pid of problemsTouched) {
    const allDeltas = await store.readDeltas(pid);
    const graph = projector.project(pid, allDeltas);
    await store.writeSnapshot(pid, graph);
    await questionQueue.rebuild(graph);
  }

  if (failed > 0) {
    console.error(`applied=${applied} failed=${failed}`);
    process.exit(1);
  }
  console.log(`applied=${applied}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
