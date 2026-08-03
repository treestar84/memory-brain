import { describe, test, expect } from "bun:test";
import { mapClaudeCodeEvent } from "../../../src/adapters/claude-code/mapper";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(import.meta.dir, "../../../fixtures/claude-code/v1");
const load = (name: string) => JSON.parse(readFileSync(join(DIR, name), "utf-8"));

const V2_DIR = join(import.meta.dir, "../../../fixtures/claude-code/v2");
const loadV2 = (name: string) => JSON.parse(readFileSync(join(V2_DIR, name), "utf-8"));

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

  /**
   * v1 fixtures (`type`, `message`, `tool_output`) were this project's own
   * initial — and wrong — guess at Claude Code's real hook payload shape.
   * Confirmed against the official docs (docs.claude.com/en/docs/claude-code/hooks):
   * the real field is `hook_event_name`, prompt text is `prompt_text`, and tool
   * results come back as `tool_result`. Because of this mismatch every real hook
   * invocation threw "Unknown hook type" (silently swallowed by hook-runner.ts's
   * catch-all) and memory capture never actually ran in production — confirmed
   * via `~/.memory-brain/security/hook-errors.jsonl` accumulating that exact
   * error for months. These tests pin the real schema so a future refactor can't
   * silently regress back to only accepting the wrong one.
   */
  describe("real Claude Code payload shape (hook_event_name, not type)", () => {
    test("maps SessionStart", () => {
      const e = mapClaudeCodeEvent(loadV2("session-start.json"), "2026-04-17T10:00:00Z");
      expect(e.stage).toBe("session-start");
      expect(e.sessionId).toBe("sess-real-456");
    });

    test("maps UserPromptSubmit — prompt_text, not message", () => {
      const e = mapClaudeCodeEvent(loadV2("prompt-submit.json"), "2026-04-17T10:01:00Z");
      expect(e.stage).toBe("prompt-submit");
      if (e.payload.stage === "prompt-submit") expect(e.payload.message).toContain("authentication");
    });

    test("maps PreToolUse", () => {
      const e = mapClaudeCodeEvent(loadV2("pre-tool-edit.json"), "2026-04-17T10:02:00Z");
      expect(e.stage).toBe("tool-pre");
      if (e.payload.stage === "tool-pre") expect(e.payload.toolName).toBe("Edit");
    });

    test("maps PostToolUse — tool_result, not tool_output", () => {
      const e = mapClaudeCodeEvent(loadV2("post-tool-edit.json"), "2026-04-17T10:03:00Z");
      expect(e.stage).toBe("tool-post");
      if (e.payload.stage === "tool-post") expect(e.payload.toolOutput).toBe("File edited successfully");
    });

    test("maps SessionEnd", () => {
      const e = mapClaudeCodeEvent(loadV2("session-end.json"), "2026-04-17T10:05:00Z");
      expect(e.stage).toBe("session-end");
    });

    test("maps Stop", () => {
      const e = mapClaudeCodeEvent(loadV2("stop.json"), "2026-04-17T10:06:00Z");
      expect(e.stage).toBe("stop");
    });

    test("throws (not silently mismaps) on the OLD wrong schema field name alone with no hook_event_name/type fallback match", () => {
      // 방어적 확인: 실제 페이로드에 진짜 hook_event_name 이 없으면(예: 이 필드
      // 자체가 다시 바뀌는 미래 회귀) 여전히 명시적으로 실패해야 한다 — 아무
      // 이벤트로도 안 잡히는 게 조용히 잘못된 이벤트로 매핑되는 것보다 낫다.
      expect(() => mapClaudeCodeEvent({ session_id: "x", prompt_text: "hi" }, "now")).toThrow();
    });
  });
});
