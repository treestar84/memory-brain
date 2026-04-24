import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { PendingQueue } from "../src/core/ledger/PendingQueue";
import { QuestionQueue } from "../src/core/gap/QuestionQueue";
import { resolveStorageRoot } from "../src/hooks/bootstrap";
import type { AskedResolution } from "../src/core/gap/types";

const storage = new FsStorage(resolveStorageRoot());
const clock = new RealClock();
const queue = new PendingQueue(storage, clock);
const questionQueue = new QuestionQueue(storage, clock);

const [action, arg1, arg2] = process.argv.slice(2);

const VALID_RESOLUTIONS: AskedResolution[] = ["answered", "unknown", "deferred"];

if (action === "list") {
  const items = await queue.list();
  console.log(`Pending items: ${items.length}`);
  for (const item of items) {
    console.log(`  ${item.id} | ${item.payload.type} | ${item.enqueuedAt}`);
  }
} else if (action === "next") {
  const item = await queue.peek();
  if (!item) {
    console.log("Queue is empty.");
  } else {
    console.log(JSON.stringify(item, null, 2));
  }
} else if (action === "done" && arg1) {
  await queue.dequeue(arg1);
  console.log(`Removed: ${arg1}`);
} else if (action === "questions") {
  const pending = await questionQueue.listPending();
  console.log(`Pending questions: ${pending.length}`);
  for (const q of pending) {
    console.log(`  ${q.questionBlockId} | voi=${q.voi.toFixed(2)} | gap=${q.gapBlockId}`);
    console.log(`    "${q.label}"`);
  }
} else if (action === "answer" && arg1 && arg2) {
  if (!VALID_RESOLUTIONS.includes(arg2 as AskedResolution)) {
    console.error(`Invalid resolution: ${arg2}. Must be one of: ${VALID_RESOLUTIONS.join(" | ")}`);
    process.exit(1);
  }
  const rec = await questionQueue.resolveAsked(arg1, arg2 as AskedResolution);
  if (!rec) {
    console.error(`No open asked record for question-id: ${arg1}`);
    process.exit(1);
  }
  console.log(`Resolved ${arg1} as "${arg2}" (gap=${rec.gapBlockId})`);
} else {
  console.error(
    [
      "Usage:",
      "  cfgm-process list",
      "  cfgm-process next",
      "  cfgm-process done <item-id>",
      "  cfgm-process questions",
      "  cfgm-process answer <question-id> <answered|unknown|deferred>",
    ].join("\n"),
  );
  process.exit(1);
}
