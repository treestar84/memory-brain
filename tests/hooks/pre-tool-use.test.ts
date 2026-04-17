import { describe, test, expect, beforeEach } from "bun:test";
import { handlePreToolUse } from "../../src/hooks/pre-tool-use";
import { MemoryStorage } from "../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../src/core/clock/Clock";
import { RawLedger } from "../../src/core/ledger/RawLedger";
import type { CanonicalEvent } from "../../src/core/events/CanonicalEvent";

function makePreTool(toolName = "Edit", command?: string): CanonicalEvent {
  const toolInput = toolName === "Bash" ? { command: command ?? "bun test" } : { file_path: "/src/a.ts" };
  return {
    platform: "claude-code", stage: "tool-pre", sessionId: "sess-001",
    cwd: "/project", timestampIso: "2026-04-17T10:00:00Z",
    payload: { stage: "tool-pre", toolName, toolInput, correlationId: "corr-abc123" },
    raw: {}, adapterVersion: "claude-code@1.0",
  };
}

describe("PreToolUse hook", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let ledger: RawLedger;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-17T10:00:00Z"));
    ledger = new RawLedger(storage, clock);
  });

  test("appends pre marker to raw ledger", async () => {
    await handlePreToolUse(makePreTool(), { storage, clock, ledger });
    const records = await storage.readJsonl("ledger/raw/2026/04/17/session-sess-001.jsonl");
    expect(records.length).toBe(1);
  });

  test("returns null for safe tools", async () => {
    const output = await handlePreToolUse(makePreTool("Edit"), { storage, clock, ledger });
    expect(output).toBeNull();
  });

  test("warns on rm -rf command", async () => {
    const output = await handlePreToolUse(makePreTool("Bash", "rm -rf /"), { storage, clock, ledger });
    expect(output).toContain("⚠️");
  });

  test("warns on sudo command", async () => {
    const output = await handlePreToolUse(makePreTool("Bash", "sudo apt install"), { storage, clock, ledger });
    expect(output).toContain("⚠️");
  });

  test("no warning for safe bash commands", async () => {
    const output = await handlePreToolUse(makePreTool("Bash", "bun test"), { storage, clock, ledger });
    expect(output).toBeNull();
  });
});
