import { describe, test, expect, beforeEach } from "bun:test";
import { handlePostToolUse } from "../../src/hooks/post-tool-use";
import { MemoryStorage } from "../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../src/core/clock/Clock";
import { RawLedger } from "../../src/core/ledger/RawLedger";
import { PendingQueue } from "../../src/core/ledger/PendingQueue";
import { ObservationNormalizer } from "../../src/core/normalizer/ObservationNormalizer";
import { Redactor } from "../../src/core/security/Redactor";
import type { CanonicalEvent } from "../../src/core/events/CanonicalEvent";

function makePostTool(toolName: string, toolInput: unknown = {}, toolOutput: unknown = "ok"): CanonicalEvent {
  return {
    platform: "claude-code", stage: "tool-post", sessionId: "sess-001",
    cwd: "/project", timestampIso: "2026-04-17T10:00:00Z",
    payload: { stage: "tool-post", toolName, toolInput, toolOutput, correlationId: "corr-abc123" },
    raw: {}, adapterVersion: "claude-code@1.0",
  };
}

describe("PostToolUse hook", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let ledger: RawLedger;
  let queue: PendingQueue;
  let normalizer: ObservationNormalizer;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-17T10:00:00Z"));
    ledger = new RawLedger(storage, clock);
    queue = new PendingQueue(storage, clock);
    normalizer = new ObservationNormalizer(new Redactor(storage, clock));
  });

  test("appends to raw ledger", async () => {
    await handlePostToolUse(makePostTool("Edit", { file_path: "/a.ts" }), {
      storage, clock, ledger, queue, normalizer,
    });
    const records = await storage.readJsonl("ledger/raw/2026/04/17/session-sess-001.jsonl");
    expect(records.length).toBe(1);
  });

  test("Edit event does not enqueue to pending", async () => {
    await handlePostToolUse(makePostTool("Edit", { file_path: "/a.ts" }), {
      storage, clock, ledger, queue, normalizer,
    });
    expect(await queue.count()).toBe(0);
  });

  test("unknown tool enqueues to pending", async () => {
    await handlePostToolUse(makePostTool("WebFetch", {}), {
      storage, clock, ledger, queue, normalizer,
    });
    expect(await queue.count()).toBe(1);
  });

  test("Bash event normalized correctly", async () => {
    await handlePostToolUse(makePostTool("Bash", { command: "bun test" }, "3 tests passed"), {
      storage, clock, ledger, queue, normalizer,
    });
    expect(await queue.count()).toBe(0);
  });

  test("Read event normalized correctly", async () => {
    await handlePostToolUse(makePostTool("Read", { file_path: "/b.ts" }, "content"), {
      storage, clock, ledger, queue, normalizer,
    });
    expect(await queue.count()).toBe(0);
  });

  test("returns null (no stdout output)", async () => {
    const output = await handlePostToolUse(makePostTool("Edit", { file_path: "/a.ts" }), {
      storage, clock, ledger, queue, normalizer,
    });
    expect(output).toBeNull();
  });
});
