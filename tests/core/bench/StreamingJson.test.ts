import { describe, expect, test } from "bun:test";
import { streamJsonArrayFromReadableStream } from "../../../src/core/bench/StreamingJson";

/** 문자열을 지정한 크기(chunkSize)로 잘라 ReadableStream<Uint8Array> 로 만든다 —
 * chunk 경계에서의 상태 기계·멀티바이트 디코딩 정확성을 강제로 시험하기 위함. */
function streamOf(text: string, chunkSize: number): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunkSize) {
        controller.enqueue(bytes.slice(i, i + chunkSize));
      }
      controller.close();
    },
  });
}

async function collect(text: string, chunkSize: number): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const item of streamJsonArrayFromReadableStream(streamOf(text, chunkSize))) {
    out.push(item);
  }
  return out;
}

describe("streamJsonArrayFromReadableStream", () => {
  test("정상 배열 round-trip — JSON.parse 결과와 동일", async () => {
    const data = [
      { id: 1, name: "alpha" },
      { id: 2, name: "beta", tags: ["x", "y"] },
      42,
      "plain string",
      true,
      null,
    ];
    const text = JSON.stringify(data);
    const result = await collect(text, 8);
    expect(result).toEqual(JSON.parse(text));
  });

  test("문자열 안의 구조 문자({, ], , ,)와 이스케이프된 따옴표를 텍스트로 취급", async () => {
    const data = [
      { note: 'has {braces}, [brackets], and, commas' },
      { quote: "she said \\\"hello\\\" and it\\'s fine" },
      { mixed: "a],b},c:d" },
    ];
    const text = JSON.stringify(data);
    const result = await collect(text, 5);
    expect(result).toEqual(JSON.parse(text));
  });

  test("중첩 객체/배열 구조를 정확히 파싱", async () => {
    const data = [
      { a: { b: { c: [1, 2, { d: "deep" }] } } },
      [[1, 2], [3, [4, 5]]],
    ];
    const text = JSON.stringify(data);
    const result = await collect(text, 3);
    expect(result).toEqual(JSON.parse(text));
  });

  test("멀티바이트(한글/이모지)가 chunk 경계에 걸려도 정확히 디코딩", async () => {
    const data = [
      { text: "안녕하세요 반갑습니다" },
      { emoji: "🎉🚀✨한글이모지혼합" },
      { text: "経済学者はデータを分析する" },
    ];
    const text = JSON.stringify(data);
    // chunk size 1바이트 — 멀티바이트 UTF-8 시퀀스가 확실히 쪼개지도록 강제
    const result = await collect(text, 1);
    expect(result).toEqual(JSON.parse(text));
  });

  test("최상위가 배열이 아니면 명확한 오류 throw", async () => {
    await expect(collect(JSON.stringify({ not: "an array" }), 4)).rejects.toThrow();
    await expect(collect(JSON.stringify("just a string"), 4)).rejects.toThrow();
    await expect(collect(JSON.stringify(42), 4)).rejects.toThrow();
  });

  test("빈 배열", async () => {
    const result = await collect("[]", 1);
    expect(result).toEqual([]);
  });

  test("원소 사이 공백/줄바꿈 허용", async () => {
    const text = `[\n  {"a": 1},\n\t{"b": 2}\n]`;
    const result = await collect(text, 6);
    expect(result).toEqual([{ a: 1 }, { b: 2 }]);
  });

  test("chunk 크기를 다양하게 바꿔도 동일한 결과 (경계 불변성)", async () => {
    const data = Array.from({ length: 20 }, (_, i) => ({ i, s: `item-${i}-한글${i}` }));
    const text = JSON.stringify(data);
    for (const chunkSize of [1, 2, 7, 64, 4096]) {
      const result = await collect(text, chunkSize);
      expect(result).toEqual(data);
    }
  });
});
