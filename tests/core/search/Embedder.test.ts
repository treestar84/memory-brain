import { describe, test, expect } from "bun:test";
import {
  HashedNgramEmbedder,
  cosineSimilarity,
  vectorToBlob,
  blobToVector,
} from "../../../src/core/search/Embedder";

describe("HashedNgramEmbedder (V3.28)", () => {
  const embedder = new HashedNgramEmbedder();

  test("deterministic — 같은 입력은 같은 벡터", () => {
    const a = embedder.embed("failure handling in queue");
    const b = embedder.embed("failure handling in queue");
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  test("L2-normalized — non-empty 텍스트의 norm ≈ 1", () => {
    const v = embedder.embed("hybrid search recall");
    let sumSq = 0;
    for (const x of v) sumSq += x * x;
    expect(Math.abs(Math.sqrt(sumSq) - 1)).toBeLessThan(1e-6);
  });

  test("빈/공백/기호-only 텍스트 → zero vector", () => {
    for (const t of ["", "   ", "!!! ??"]) {
      const v = embedder.embed(t);
      expect(v.every((x) => x === 0)).toBe(true);
    }
  });

  test("형태소 변형이 무관 텍스트보다 유사 — prefix 불일치 오타 포함", () => {
    const base = embedder.embed("contradiction detection report");
    const morph = embedder.embed("contradictions detected reporting");
    const unrelated = embedder.embed("banana smoothie recipe");
    expect(cosineSimilarity(base, morph)).toBeGreaterThan(cosineSimilarity(base, unrelated));
  });

  test("한글 조사 변형에 관용적", () => {
    const base = embedder.embed("메모리 라우팅 정책");
    const morph = embedder.embed("메모리를 라우팅하는 정책이");
    const unrelated = embedder.embed("주말 등산 코스 추천");
    expect(cosineSimilarity(base, morph)).toBeGreaterThan(cosineSimilarity(base, unrelated));
  });

  test("n-gram 길이보다 짧은 입력도 동작", () => {
    const v = embedder.embed("a");
    let sumSq = 0;
    for (const x of v) sumSq += x * x;
    expect(sumSq).toBeGreaterThan(0);
  });

  test("생성자 가드 — dims/ngram 하한", () => {
    expect(() => new HashedNgramEmbedder({ dims: 4 })).toThrow();
    expect(() => new HashedNgramEmbedder({ ngram: 1 })).toThrow();
  });

  test("dims 커스터마이즈", () => {
    const small = new HashedNgramEmbedder({ dims: 64 });
    expect(small.embed("test").length).toBe(64);
    expect(small.dims).toBe(64);
  });
});

describe("cosineSimilarity / blob 변환", () => {
  test("cosine — 동일 벡터 1, 직교 0", () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);
    expect(cosineSimilarity(a, a)).toBeCloseTo(1);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0);
  });

  test("cosine — dims 불일치 시 throw, zero vector 는 0", () => {
    expect(() => cosineSimilarity(new Float32Array(2), new Float32Array(3))).toThrow();
    expect(cosineSimilarity(new Float32Array([0, 0]), new Float32Array([1, 1]))).toBe(0);
  });

  test("vectorToBlob ↔ blobToVector round-trip", () => {
    const v = new Float32Array([0.5, -1.25, 3.75]);
    const back = blobToVector(vectorToBlob(v));
    expect(Array.from(back)).toEqual(Array.from(v));
  });
});
