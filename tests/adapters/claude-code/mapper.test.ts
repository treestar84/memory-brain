import { describe, test, expect } from "bun:test";
import { mapClaudeCodeEvent } from "../../../src/adapters/claude-code/mapper";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(import.meta.dir, "../../../fixtures/claude-code/v1");
const load = (name: string) => JSON.parse(readFileSync(join(DIR, name), "utf-8"));

describe("mapClaudeCodeEvent", () => {
  test("maps SessionStart", () => {
    const e = mapClaudeCodeEvent(load("session-start.json"), "2026-04-17T10:00:00Z");
    expect(e.platform).toBe("claude-code");
    expect(e.stage).toBe("session-start");
    expect(e.sessionId).toBe("sess-abc-123");
  });

  test("maps PromptSubmit", () => {
    const e = mapClaudeCodeEvent(load("prompt-submit.json"), "2026-04-17T10:01:00Z");
    expect(e.stage).toBe("prompt-submit");
    if (e.payload.stage === "prompt-submit") expect(e.payload.message).toContain("authentication");
  });

  test("maps PreToolUse with correlationId", () => {
    const e = mapClaudeCodeEvent(load("pre-tool-edit.json"), "2026-04-17T10:02:00Z");
    expect(e.stage).toBe("tool-pre");
    if (e.payload.stage === "tool-pre") {
      expect(e.payload.toolName).toBe("Edit");
      expect(e.payload.correlationId).toMatch(/^corr-/);
    }
  });

  test("maps PostToolUse", () => {
    const e = mapClaudeCodeEvent(load("post-tool-edit.json"), "2026-04-17T10:03:00Z");
    expect(e.stage).toBe("tool-post");
    if (e.payload.stage === "tool-post") expect(e.payload.toolOutput).toBe("File edited successfully");
  });

  test("maps PreCompact", () => {
    const e = mapClaudeCodeEvent(load("pre-compact.json"), "2026-04-17T10:04:00Z");
    if (e.payload.stage === "compact-pre") expect(e.payload.turnCount).toBe(42);
  });

  test("all 10 fixtures produce valid events", () => {
    const files = readdirSync(DIR).filter(f => f.endsWith(".json"));
    expect(files.length).toBe(10);
    for (const f of files) {
      const e = mapClaudeCodeEvent(load(f), "2026-04-17T10:00:00Z");
      expect(typeof e.sessionId).toBe("string");
    }
  });

  test("throws on unknown type", () => {
    expect(() => mapClaudeCodeEvent({ type: "Unknown" }, "now")).toThrow();
  });
});
