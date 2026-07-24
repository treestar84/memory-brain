import { describe, test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { estimateTokens, estimateMemoryCorpusTokens } from "../../../src/core/stats/TokenEstimate";

describe("TokenEstimate", () => {
  test("estimateTokens — chars/4 반올림 추정", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcdefgh")).toBe(2);
    expect(estimateTokens("abcde")).toBe(2); // ceil(5/4) = 2
  });

  test("estimateMemoryCorpusTokens — memory/{concepts,decisions,projects} .md 파일 크기 합, `_` 디렉토리는 제외", async () => {
    const root = mkdtempSync(join(tmpdir(), "token-estimate-"));
    const memoryDir = join(root, "memory");
    const concepts = join(memoryDir, "concepts");
    const archived = join(memoryDir, "_archive");
    await mkdir(concepts, { recursive: true });
    await mkdir(archived, { recursive: true });

    const asciiText = "a".repeat(40); // ascii 로 bytes == chars 를 보장해 검증을 단순화한다.
    await writeFile(join(concepts, "a.md"), asciiText);
    await writeFile(join(archived, "b.md"), asciiText); // 제외 대상

    const tokens = await estimateMemoryCorpusTokens(memoryDir);
    expect(tokens).toBe(Math.ceil(40 / 4));
  });

  test("estimateMemoryCorpusTokens — memory 디렉토리 부재 시 0", async () => {
    const root = mkdtempSync(join(tmpdir(), "token-estimate-empty-"));
    const tokens = await estimateMemoryCorpusTokens(join(root, "memory"));
    expect(tokens).toBe(0);
  });
});
