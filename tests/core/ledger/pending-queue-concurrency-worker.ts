// Helper script spawned as a real child process by pending-queue.concurrency.test.ts.
// Runs one queue operation against a shared FsStorage root and exits.
import { FsStorage } from "../../../src/core/storage/FsStorage";
import { RealClock } from "../../../src/core/clock/Clock";
import { PendingQueue } from "../../../src/core/ledger/PendingQueue";

const [root, op, arg] = process.argv.slice(2);
const storage = new FsStorage(root!);
const queue = new PendingQueue(storage, new RealClock());

async function main() {
  if (op === "enqueue") {
    await queue.enqueue({ type: "t", data: {} }, arg);
  } else if (op === "drain") {
    await queue.drainForSession(arg!);
  } else if (op === "dequeue") {
    await queue.dequeue(arg!);
  } else {
    throw new Error(`unknown op: ${op}`);
  }
}

main();
