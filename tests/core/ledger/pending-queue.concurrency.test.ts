import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FsStorage } from "../../../src/core/storage/FsStorage";
import { RealClock } from "../../../src/core/clock/Clock";
import { PendingQueue } from "../../../src/core/ledger/PendingQueue";

const WORKER = join(import.meta.dir, "pending-queue-concurrency-worker.ts");

function runWorker(root: string, op: string, arg?: string) {
  const args = arg !== undefined ? [WORKER, root, op, arg] : [WORKER, root, op];
  return Bun.spawn({ cmd: ["bun", "run", ...args], stdout: "pipe", stderr: "pipe" }).exited;
}

describe("PendingQueue cross-process concurrency (regression: read-modify-rewrite lost update)", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "cfgm-pending-concurrency-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("two real processes draining different sessions concurrently lose nothing", async () => {
    const storage = new FsStorage(root);
    const queue = new PendingQueue(storage, new RealClock());
    await queue.enqueue({ type: "t", data: {} }, "sessA");
    await queue.enqueue({ type: "t", data: {} }, "sessB");

    // Two independent processes racing to drain two different sessions —
    // under the old read-list-filter-rewrite implementation, whichever
    // process's rewrite lands last would silently erase the other's item.
    await Promise.all([runWorker(root, "drain", "sessA"), runWorker(root, "drain", "sessB")]);

    const remaining = await queue.list();
    expect(remaining.length).toBe(0);
  });

  test("a process enqueuing while another drains a different session doesn't lose the new item", async () => {
    const storage = new FsStorage(root);
    const queue = new PendingQueue(storage, new RealClock());
    await queue.enqueue({ type: "t", data: {} }, "sessA");

    await Promise.all([
      runWorker(root, "drain", "sessA"),
      runWorker(root, "enqueue", "sessB"),
    ]);

    const remaining = await queue.list();
    // sessA's item was drained (tombstoned); sessB's concurrently-enqueued item must survive.
    expect(remaining.length).toBe(1);
    expect(remaining[0].sessionId).toBe("sessB");
  });

  test("dequeue and drainForSession racing on disjoint ids both take effect", async () => {
    const storage = new FsStorage(root);
    const queue = new PendingQueue(storage, new RealClock());
    const a = await queue.enqueue({ type: "t", data: {} }, "sessA");
    await queue.enqueue({ type: "t", data: {} }, "sessB");

    await Promise.all([runWorker(root, "dequeue", a.id), runWorker(root, "drain", "sessB")]);

    const remaining = await queue.list();
    expect(remaining.length).toBe(0);
  });

  test("compact() collapses item+tombstone pairs down to only live items", async () => {
    const storage = new FsStorage(root);
    const queue = new PendingQueue(storage, new RealClock());
    await queue.enqueue({ type: "t", data: {} }, "sessA");
    const b = await queue.enqueue({ type: "t", data: {} }, "sessB");
    await queue.dequeue(b.id);

    const result = await queue.compact();
    expect(result.before).toBe(3); // 2 items + 1 tombstone
    expect(result.after).toBe(1);

    const remaining = await queue.list();
    expect(remaining.length).toBe(1);
    expect(remaining[0].sessionId).toBe("sessA");
  });
});
