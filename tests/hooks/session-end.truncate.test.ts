import { describe, test, expect } from "bun:test";
import { truncateToBytes } from "../../src/hooks/session-end";

describe("truncateToBytes — UTF-8 경계 안전 절단 (모지바케 버그 회귀)", () => {
  test("바이트 예산 이내면 그대로", () => {
    const text = "짧은 한글 텍스트";
    expect(truncateToBytes(text, 1024)).toBe(text);
  });

  test("멀티바이트(한글) 경계에서 잘려도 U+FFFD 가 남지 않는다", () => {
    // "가" 는 UTF-8 3바이트 — 예산을 정확히 문자 중간에서 끊기게 구성한다.
    const text = "가".repeat(100); // 300 bytes
    for (const budget of [10, 11, 50, 100, 298, 299, 301]) {
      const result = truncateToBytes(text, budget);
      expect(result).not.toContain("�");
    }
  });

  test("바이트 예산을 초과하지 않는다", () => {
    const text = "가".repeat(100);
    const maxBytes = 50;
    const result = truncateToBytes(text, maxBytes);
    expect(Buffer.byteLength(result, "utf-8")).toBeLessThanOrEqual(maxBytes);
  });

  test("절단 시 (truncated) 마커가 붙는다", () => {
    const text = "가".repeat(100);
    const result = truncateToBytes(text, 50);
    expect(result).toContain("(truncated)");
  });

  test("ASCII 텍스트 절단은 기존과 동일하게 동작", () => {
    const text = "a".repeat(100);
    const result = truncateToBytes(text, 50);
    expect(Buffer.byteLength(result, "utf-8")).toBeLessThanOrEqual(50);
    expect(result).toContain("(truncated)");
  });
});
