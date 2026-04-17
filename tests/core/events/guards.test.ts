import { describe, test, expect } from "bun:test";
import { isValidStage, isCanonicalEvent, isToolPre, isToolPost, isPromptSubmit } from "../../../src/core/events/guards";
import type { CanonicalEvent } from "../../../src/core/events/CanonicalEvent";

function makeEvent(overrides: Partial<CanonicalEvent> = {}): CanonicalEvent {
  return {
    platform: "claude-code", stage: "session-start", sessionId: "sess-001",
    cwd: "/project", timestampIso: "2026-04-17T10:00:00.000Z",
    payload: { stage: "session-start" }, raw: {}, adapterVersion: "claude-code@1.0",
    ...overrides,
  };
}

describe("isValidStage", () => {
  test("accepts all 7 stages", () => {
    for (const s of ["session-start","prompt-submit","tool-pre","tool-post","compact-pre","session-end","stop"])
      expect(isValidStage(s)).toBe(true);
  });
  test("rejects invalid", () => { expect(isValidStage("bogus")).toBe(false); expect(isValidStage(42)).toBe(false); });
});

describe("isCanonicalEvent", () => {
  test("accepts valid event", () => { expect(isCanonicalEvent(makeEvent())).toBe(true); });
  test("rejects null", () => { expect(isCanonicalEvent(null)).toBe(false); });
  test("rejects missing fields", () => { const { platform, ...rest } = makeEvent(); expect(isCanonicalEvent(rest)).toBe(false); });
});

describe("stage guards", () => {
  test("isToolPre", () => {
    const pre = makeEvent({ stage: "tool-pre", payload: { stage: "tool-pre", toolName: "Edit", toolInput: {}, correlationId: "c1" } });
    expect(isToolPre(pre)).toBe(true);
    expect(isToolPre(makeEvent())).toBe(false);
  });
  test("isToolPost", () => {
    const post = makeEvent({ stage: "tool-post", payload: { stage: "tool-post", toolName: "Edit", toolInput: {}, toolOutput: {}, correlationId: "c1" } });
    expect(isToolPost(post)).toBe(true);
  });
  test("isPromptSubmit", () => {
    const ps = makeEvent({ stage: "prompt-submit", payload: { stage: "prompt-submit", message: "hi" } });
    expect(isPromptSubmit(ps)).toBe(true);
  });
});
