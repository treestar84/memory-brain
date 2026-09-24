import { describe, test, expect } from "bun:test";
import { shQuote } from "../../bin/lib/shell-quote";

describe("shQuote", () => {
  describe("posix (default / darwin / linux)", () => {
    test("wraps in single quotes", () => {
      expect(shQuote("/a/b c", "darwin")).toBe("'/a/b c'");
    });

    test("escapes internal single quotes", () => {
      expect(shQuote("it's", "linux")).toBe("'it'\\''s'");
    });

    test("defaults to process.platform when no platform arg given", () => {
      // CI 는 이 스위트를 win32 러너에서도 돌린다 — 실행 중인 실제 플랫폼
      // 기준으로 기대값을 골라야, "인자 생략 시 process.platform 을 쓴다"는
      // 이 테스트의 주장 자체가 모든 호스트에서 의미 있게 검증된다.
      const expected = process.platform === "win32" ? '"a b"' : "'a b'";
      expect(shQuote("a b")).toBe(expected);
    });
  });

  describe("win32", () => {
    test("wraps in double quotes", () => {
      expect(shQuote("C:\\Users\\a b", "win32")).toBe('"C:\\Users\\a b"');
    });

    test("escapes internal double quotes", () => {
      expect(shQuote('a"b', "win32")).toBe('"a\\"b"');
    });

    test("doubles a trailing backslash so it doesn't escape the closing quote", () => {
      expect(shQuote("C:\\path\\", "win32")).toBe('"C:\\path\\\\"');
    });

    test("does not use single-quote quoting on win32", () => {
      const q = shQuote("it's", "win32");
      expect(q.startsWith('"')).toBe(true);
      expect(q.endsWith('"')).toBe(true);
    });
  });
});
