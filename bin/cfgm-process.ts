import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { PendingQueue } from "../src/core/ledger/PendingQueue";

const projectRoot = process.env.CFGM_PROJECT_ROOT || process.cwd();
const storage = new FsStorage(`${projectRoot}/.memory-brain`);
const queue = new PendingQueue(storage, new RealClock());

const [action, itemId] = process.argv.slice(2);

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
} else if (action === "done" && itemId) {
  await queue.dequeue(itemId);
  console.log(`Removed: ${itemId}`);
} else {
  console.error("Usage: cfgm-process list | next | done <item-id>");
  process.exit(1);
}
