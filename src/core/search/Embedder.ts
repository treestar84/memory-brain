/**
 * Embedder — hybrid search 용 벡터화 인터페이스 (V3.28).
 *
 * docs/RULES.md 원칙 2 준수: default 구현은 LLM API 를 호출하지 않는다.
 * `HashedNgramEmbedder` 는 의존성 0 의 결정론적 character n-gram 벡터라이저 —
 * FTS5 unicode61 의 형태소/오타 취약점을 보완하는 lexical-similarity 층이며
 * semantic embedding 이 아니다. 실제 embedding 모델을 쓰고 싶은 사용자는
 * 본 인터페이스를 구현해 주입하면 된다 (opt-in seam).
 */

export interface Embedder {
  /** 벡터 차원 수. 같은 인덱스에 저장·질의하는 embedder 는 dims 가 일치해야 한다. */
  readonly dims: number;
  /** 텍스트 → L2-normalized 벡터. 빈/공백 텍스트는 zero vector. */
  embed(text: string): Float32Array;
}

/**
 * FNV-1a 32-bit — 결정론적 문자열 해시. 암호학적 용도 아님 (버킷 분배 전용).
 */
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export class HashedNgramEmbedder implements Embedder {
  readonly dims: number;
  private readonly n: number;

  constructor(opts: { dims?: number; ngram?: number } = {}) {
    this.dims = opts.dims ?? 256;
    this.n = opts.ngram ?? 3;
    if (this.dims < 8) throw new Error("HashedNgramEmbedder: dims must be >= 8");
    if (this.n < 2) throw new Error("HashedNgramEmbedder: ngram must be >= 2");
  }

  embed(text: string): Float32Array {
    const vec = new Float32Array(this.dims);
    // NFKC 정규화 + 문자/숫자 외 구분자를 단일 공백으로 접어 토큰 경계 보존.
    // 한글은 음절 단위 n-gram 이 곧 형태소 관용도 — 조사/어미 변형에 강하다.
    const normalized = text
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
    if (normalized.length === 0) return vec;

    // 경계 n-gram 이 단어 시작/끝 신호를 갖도록 공백 패딩.
    const padded = ` ${normalized} `;
    if (padded.length < this.n) {
      vec[fnv1a(padded) % this.dims] += 1;
    } else {
      for (let i = 0; i + this.n <= padded.length; i++) {
        const gram = padded.slice(i, i + this.n);
        vec[fnv1a(gram) % this.dims]! += 1;
      }
    }

    let sumSq = 0;
    for (let i = 0; i < vec.length; i++) sumSq += vec[i]! * vec[i]!;
    if (sumSq > 0) {
      const norm = Math.sqrt(sumSq);
      for (let i = 0; i < vec.length; i++) vec[i]! /= norm;
    }
    return vec;
  }
}

/** 두 벡터의 cosine 유사도. L2-normalized 입력이면 dot product 와 동일. */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`cosineSimilarity: dims mismatch (${a.length} vs ${b.length})`);
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Float32Array ↔ SQLite BLOB 변환 (little-endian 그대로 재해석). */
export function vectorToBlob(vec: Float32Array): Uint8Array {
  return new Uint8Array(vec.buffer.slice(vec.byteOffset, vec.byteOffset + vec.byteLength));
}

export function blobToVector(blob: Uint8Array): Float32Array {
  const buf = blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength);
  return new Float32Array(buf);
}
