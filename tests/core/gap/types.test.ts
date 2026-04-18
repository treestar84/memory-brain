import { describe, test, expect } from "bun:test";
import { isStructuralDetectorId, isDetectorId, isQuestionLifecycle } from "../../../src/core/gap/guards";

describe("Gap type guards", () => {
  test("structural ids", () => {
    expect(isStructuralDetectorId("rule:orphan-action")).toBe(true);
    expect(isStructuralDetectorId("rule:unknown")).toBe(false);
    expect(isStructuralDetectorId("semantic")).toBe(false);
  });
  test("semantic is valid detector id", () => {
    expect(isDetectorId("semantic")).toBe(true);
    expect(isDetectorId("rule:orphan-action")).toBe(true);
    expect(isDetectorId("bad")).toBe(false);
  });
  test("lifecycle", () => {
    (["pending", "asked", "answered", "stale"] as const).forEach((l) =>
      expect(isQuestionLifecycle(l)).toBe(true));
    expect(isQuestionLifecycle("done")).toBe(false);
  });
});
