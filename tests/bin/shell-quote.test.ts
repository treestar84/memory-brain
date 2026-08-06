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
      // 이 테스트 프로세스는 posix 계열(darwin/linux)에서 돈다.
      expect(shQuote("a b")).toBe("'a b'");
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
