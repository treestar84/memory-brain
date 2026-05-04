import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SSLReader } from "../../../src/core/search/SSLReader";
import { SearchIndex } from "../../../src/core/search/SearchIndex";
import { Indexer } from "../../../src/core/search/Indexer";
import { WikiReader } from "../../../src/core/wiki/WikiReader";
import { ClaimStore } from "../../../src/core/claim/ClaimStore";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";
import { SkillNormalizer } from "../../../src/core/normalizer/SkillNormalizer";

const DEBUG_SKILL = `---
name: debug-skill
description: Debug failing tests. Use when the user reports test failures.
---
## Acquire
Read the failing test file.
## Act
Edit the source file.
## Verify
Run Bash to re-execute tests.
`;

function makeSSLDoc(slug: string, source: string): string {
  const doc = new SkillNormalizer().normalize({
    skillPath: `/skills/${slug}.md`,
    source,
    sourceSha256: slug,
    generatedAt: "2026-05-05T00:00:00Z",
  });
  return JSON.stringify(doc, null, 2);
}

describe("SSLReader + Indexer integration (PR-V3.14)", () => {
  let memoryDir: string;

  beforeEach(async () => {
    memoryDir = await mkdtemp(join(tmpdir(), "ssl-reader-"));
    await mkdir(join(memoryDir, "concepts", "_ssl"), { recursive: true });
    await mkdir(join(memoryDir, "decisions"), { recursive: true });
  });

  afterEach(async () => {
    await rm(memoryDir, { recursive: true, force: true });
  });

  test("SSLReader reads valid SSL JSON, skips malformed", async () => {
    await writeFile(
      join(memoryDir, "concepts", "_ssl", "debug.json"),
      makeSSLDoc("debug", DEBUG_SKILL),
    );
    await writeFile(join(memoryDir, "concepts", "_ssl", "broken.json"), "{ not json");
    await writeFile(
      join(memoryDir, "concepts", "_ssl", "bad-schema.json"),
      JSON.stringify({ sslVersion: "0.0.0" }),
    );

    const reader = new SSLReader(memoryDir);
    const result = await reader.readAll();

    expect(result.docs.length).toBe(1);
    expect(result.docs[0].scheduling.skillName).toBe("debug-skill");
    expect(result.errors.length).toBe(2);
    expect(result.errors.some((e) => e.path.endsWith("broken.json"))).toBe(true);
    expect(result.errors.some((e) => e.path.endsWith("bad-schema.json"))).toBe(true);
  });

  test("Indexer wires SSL into SearchIndex end-to-end", async () => {
    await writeFile(
      join(memoryDir, "concepts", "_ssl", "debug.json"),
      makeSSLDoc("debug", DEBUG_SKILL),
    );

    const wikiReader = new WikiReader(memoryDir);
    const claimStorage = new MemoryStorage();
    const claimStore = new ClaimStore(claimStorage, new FakeClock());
    const sslReader = new SSLReader(memoryDir);
    const index = new SearchIndex(":memory:");
    const indexer = new Indexer(wikiReader, claimStore, index, sslReader);

    const result = await indexer.rebuild();
    expect(result.skillCount).toBe(1);

    const hits = index.searchSkills("test failure");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].skillName).toBe("debug-skill");

    index.close();
  });

  test("Indexer without SSLReader stays back-compat", async () => {
    const wikiReader = new WikiReader(memoryDir);
    const claimStorage = new MemoryStorage();
    const claimStore = new ClaimStore(claimStorage, new FakeClock());
    const index = new SearchIndex(":memory:");
    const indexer = new Indexer(wikiReader, claimStore, index); // sslReader omitted

    const result = await indexer.rebuild();
    expect(result.skillCount).toBe(0);
    expect(index.searchSkills("anything")).toEqual([]);

    index.close();
  });

  test("WikiReader skip — _ssl/*.json doesn't leak as wiki_pages", async () => {
    await writeFile(
      join(memoryDir, "concepts", "_ssl", "debug.json"),
      makeSSLDoc("debug", DEBUG_SKILL),
    );
    // Add a real wiki page that should be indexed
    await writeFile(
      join(memoryDir, "decisions", "test-decision.md"),
      `---\nid: decision.test\ntype: decision\nstatus: active\nupdated_at: 2026-05-05\n---\n# Test\n## Summary\n<!-- claim:cl-1 -->\nA decision.\n`,
    );

    const wikiReader = new WikiReader(memoryDir);
    const claimStorage = new MemoryStorage();
    const claimStore = new ClaimStore(claimStorage, new FakeClock());
    const sslReader = new SSLReader(memoryDir);
    const index = new SearchIndex(":memory:");
    const indexer = new Indexer(wikiReader, claimStore, index, sslReader);

    const result = await indexer.rebuild();
    expect(result.wikiCount).toBe(1);    // only the .md, not the _ssl/*.json
    expect(result.skillCount).toBe(1);   // ssl picked up

    index.close();
  });
});
