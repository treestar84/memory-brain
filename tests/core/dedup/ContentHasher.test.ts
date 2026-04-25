import { describe, test, expect } from "bun:test";
import { ContentHasher } from "../../../src/core/dedup/ContentHasher";

describe("ContentHasher", () => {
  const hasher = new ContentHasher();

  test("NFKC normalization: fullwidth ASCII", () => {
    const a = hasher.hash("Cause", "ＡＢＣ"); // ＡＢＣ
    const b = hasher.hash("Cause", "ABC");
    expect(a).toBe(b);
  });

  test("whitespace squeeze", () => {
    const a = hasher.hash("Cause", "a  b   c");
    const b = hasher.hash("Cause", "a b c");
    expect(a).toBe(b);
  });

  test("case insensitivity", () => {
    const a = hasher.hash("Cause", "Hello World");
    const b = hasher.hash("Cause", "hello world");
    expect(a).toBe(b);
  });

  test("type separation: same label different type → different hash", () => {
    const cause = hasher.hash("Cause", "foo");
    const gap = hasher.hash("Gap", "foo");
    expect(cause).not.toBe(gap);
  });

  test("Hangul NFC: precomposed vs conjoining jamo → same hash", () => {
    // Precomposed: U+D55C U+AE00 → "한글"
    const composed = hasher.hash("Cause", String.fromCodePoint(0xD55C, 0xAE00));
    // Conjoining jamo: ㅎ U+1112 + ㅏ U+1161 + ㄴ U+11AB + ㄱ U+1100 + ㅡ U+1173 + ㄹ U+11AF
    const decomposed = hasher.hash(
      "Cause",
      String.fromCodePoint(0x1112, 0x1161, 0x11AB, 0x1100, 0x1173, 0x11AF),
    );
    expect(composed).toBe(decomposed);
  });
});
