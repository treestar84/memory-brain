import { describe, test, expect, beforeEach } from "bun:test";
import { ObservationNormalizer } from "../../../src/core/normalizer/ObservationNormalizer";
import { Redactor } from "../../../src/core/security/Redactor";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";
import type { CanonicalEvent } from "../../../src/core/events/CanonicalEvent";

function makeEvent(overrides: Partial<CanonicalEvent> = {}): CanonicalEvent {
  return {
    platform: "claude-code", stage: "tool-post", sessionId: "sess-001",
    cwd: "/project", timestampIso: "2026-04-17T10:00:00Z",
    payload: { stage: "tool-post", toolName: "Edit", toolInput: { file_path: "/src/a.ts" }, toolOutput: "ok", correlationId: "c1" },
    raw: {}, adapterVersion: "claude-code@1.0", ...overrides,
  };
}

describe("ObservationNormalizer", () => {
  let normalizer: ObservationNormalizer;
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    normalizer = new ObservationNormalizer(new Redactor(storage, new FakeClock()));
  });

  test("Edit → filesTouched", async () => {
    const obs = await normalizer.normalize(makeEvent());
    expect(obs?.type).toBe("tool:Edit");
    expect(obs?.data.filesTouched).toEqual(["/src/a.ts"]);
    expect(obs?.needsAnalysis).toBe(false);
  });

  test("Write → filesTouched", async () => {
    const obs = await normalizer.normalize(makeEvent({
      payload: { stage: "tool-post", toolName: "Write", toolInput: { file_path: "/new.ts" }, toolOutput: "ok", correlationId: "c2" },
    }));
    expect(obs?.data.filesTouched).toEqual(["/new.ts"]);
  });

  test("Bash → command + exitCode", async () => {
    const obs = await normalizer.normalize(makeEvent({
      payload: { stage: "tool-post", toolName: "Bash", toolInput: { command: "bun test" }, toolOutput: "PASS", correlationId: "c3" },
    }));
    expect(obs?.type).toBe("tool:Bash");
    expect(obs?.data.command).toBe("bun test");
  });

  test("Bash with secret in command gets redacted", async () => {
    const obs = await normalizer.normalize(makeEvent({
      payload: { stage: "tool-post", toolName: "Bash", toolInput: { command: "curl -H 'Authorization: sk-ant-abcdefghijklmnopqrstuv'" }, toolOutput: "ok", correlationId: "c4" },
    }));
    expect(obs?.data.command).toContain("<REDACTED:");
  });

  test("Read → filesRead", async () => {
    const obs = await normalizer.normalize(makeEvent({
      payload: { stage: "tool-post", toolName: "Read", toolInput: { file_path: "/src/b.ts" }, toolOutput: "content", correlationId: "c5" },
    }));
    expect(obs?.data.filesRead).toEqual(["/src/b.ts"]);
  });

  test("Grep → searchPattern", async () => {
    const obs = await normalizer.normalize(makeEvent({
      payload: { stage: "tool-post", toolName: "Grep", toolInput: { pattern: "TODO" }, toolOutput: "", correlationId: "c6" },
    }));
    expect(obs?.data.searchPattern).toBe("TODO");
  });

  test("unknown tool → ambiguous + needsAnalysis", async () => {
    const obs = await normalizer.normalize(makeEvent({
      payload: { stage: "tool-post", toolName: "WebFetch", toolInput: {}, toolOutput: "", correlationId: "c7" },
    }));
    expect(obs?.needsAnalysis).toBe(true);
    expect(obs?.data._ambiguous).toBe(true);
  });

  test("prompt-submit → user-intent + needsAnalysis", async () => {
    const obs = await normalizer.normalize(makeEvent({
      stage: "prompt-submit",
      payload: { stage: "prompt-submit", message: "Fix the auth bug" },
    }));
    expect(obs?.type).toBe("user-intent");
    expect(obs?.data.userIntentRaw).toBe("Fix the auth bug");
    expect(obs?.needsAnalysis).toBe(true);
  });

  test("session-start → no analysis needed", async () => {
    const obs = await normalizer.normalize(makeEvent({
      stage: "session-start",
      payload: { stage: "session-start" },
    }));
    expect(obs?.type).toBe("session-start");
    expect(obs?.needsAnalysis).toBe(false);
  });

  test("tool-pre returns null (pre events not normalized)", async () => {
    const obs = await normalizer.normalize(makeEvent({
      stage: "tool-pre",
      payload: { stage: "tool-pre", toolName: "Edit", toolInput: {}, correlationId: "c8" },
    }));
    expect(obs).toBeNull();
  });

  test("prompt-submit with secret gets redacted", async () => {
    const obs = await normalizer.normalize(makeEvent({
      stage: "prompt-submit",
      payload: { stage: "prompt-submit", message: "use password=superSecret123 for testing" },
    }));
    expect(obs?.data.userIntentRaw).toContain("<REDACTED:");
  });
});
