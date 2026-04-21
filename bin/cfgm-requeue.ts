import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { PendingQueue } from "../src/core/ledger/PendingQueue";
import type { PendingItem } from "../src/core/ledger/PendingQueue";
import { resolveStorageRoot } from "../src/hooks/bootstrap";

const storage = new FsStorage(resolveStorageRoot());
const clock = new RealClock();
const queue = new PendingQueue(storage, clock);

const EXPIRED_PATH = "ledger/expired-analysis.jsonl";

const [action, itemId] = process.argv.slice(2);

if (action === "list") {
  const expired = await storage.readJsonl<PendingItem & { expiredAt: string }>(EXPIRED_PATH);
  console.log(`Expired items: ${expired.length}`);
  for (const item of expired) {
    console.log(`  ${item.id} | ${item.payload.type} | expired: ${item.expiredAt}`);
  }
} else if (action === "all") {
  const expired = await storage.readJsonl<PendingItem>(EXPIRED_PATH);
  for (const item of expired) {
    await queue.enqueue(item.payload);
  }
  await storage.writeRaw(EXPIRED_PATH, "");
  console.log(`Requeued ${expired.length} items.`);
} else if (action && itemId === undefined) {
  const expired = await storage.readJsonl<PendingItem & { expiredAt: string }>(EXPIRED_PATH);
  const target = expired.find((i) => i.id === action);
  if (!target) {
    console.error(`Item not found: ${action}`);
    process.exit(1);
  }
  await queue.enqueue(target.payload);
  const remaining = expired.filter((i) => i.id !== action);
  const content = remaining.map((i) => JSON.stringify(i)).join("\n") + (remaining.length ? "\n" : "");
  await storage.writeRaw(EXPIRED_PATH, content);
  console.log(`Requeued: ${action}`);
} else {
  console.error("Usage: cfgm-requeue list | all | <item-id>");
  process.exit(1);
}
