import { describe, test, expect, beforeEach } from "bun:test";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FsStorage } from "../../../src/core/storage/FsStorage";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Storage } from "../../../src/core/storage/Storage";

function contractSuite(
  name: string,
  factory: () => Promise<{ storage: Storage; cleanup: () => Promise<void> }>
) {
  describe(`Storage contract: ${name}`, () => {
    let storage: Storage;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      const ctx = await factory();
      storage = ctx.storage;
      cleanup = ctx.cleanup;
    });

    test("appendJsonl + readJsonl round-trip", async () => {
      await storage.appendJsonl("test.jsonl", { a: 1 });
      await storage.appendJsonl("test.jsonl", { b: 2 });
      const records = await storage.readJsonl("test.jsonl");
      expect(records).toEqual([{ a: 1 }, { b: 2 }]);
      await cleanup();
    });

    test("writeJsonAtomic + readJson round-trip", async () => {
      await storage.writeJsonAtomic("data.json", { key: "value" });
      const data = await storage.readJson("data.json");
      expect(data).toEqual({ key: "value" });
      await cleanup();
    });

    test("readJson returns null for missing file", async () => {
      const data = await storage.readJson("nonexistent.json");
      expect(data).toBeNull();
      await cleanup();
    });

    test("readJsonl returns empty array for missing file", async () => {
      const records = await storage.readJsonl("nonexistent.jsonl");
      expect(records).toEqual([]);
      await cleanup();
    });

    test("exists returns false/true correctly", async () => {
      expect(await storage.exists("nope.json")).toBe(false);
      await storage.writeJsonAtomic("yep.json", {});
      expect(await storage.exists("yep.json")).toBe(true);
      await cleanup();
    });

    test("ensureDir creates nested directories", async () => {
      await storage.ensureDir("a/b/c");
      await storage.writeJsonAtomic("a/b/c/file.json", { ok: true });
      const data = await storage.readJson("a/b/c/file.json");
      expect(data).toEqual({ ok: true });
      await cleanup();
    });

    test("listFiles returns matching files", async () => {
      await storage.writeJsonAtomic("dir/a.json", {});
      await storage.writeJsonAtomic("dir/b.jsonl", {});
      await storage.writeJsonAtomic("dir/c.json", {});
      const all = await storage.listFiles("dir");
      expect(all.sort()).toEqual(["a.json", "b.jsonl", "c.json"]);
      const jsonOnly = await storage.listFiles("dir", "*.json");
      expect(jsonOnly.sort()).toEqual(["a.json", "c.json"]);
      await cleanup();
    });

    test("listFiles returns empty for missing dir", async () => {
      expect(await storage.listFiles("nope")).toEqual([]);
      await cleanup();
    });

    test("fileSize returns byte count", async () => {
      await storage.writeJsonAtomic("sized.json", { hello: "world" });
      expect(await storage.fileSize("sized.json")).toBeGreaterThan(0);
      await cleanup();
    });

    test("fileSize returns 0 for missing file", async () => {
      expect(await storage.fileSize("missing.json")).toBe(0);
      await cleanup();
    });

    test("appendJsonl creates parent directories", async () => {
      await storage.appendJsonl("deep/nested/file.jsonl", { x: 1 });
      const records = await storage.readJsonl("deep/nested/file.jsonl");
      expect(records).toEqual([{ x: 1 }]);
      await cleanup();
    });

    test("writeJsonAtomic overwrites existing", async () => {
      await storage.writeJsonAtomic("over.json", { v: 1 });
      await storage.writeJsonAtomic("over.json", { v: 2 });
      const result = await storage.readJson("over.json");
      expect(result).toEqual({ v: 2 });
      await cleanup();
    });

    test("writeRaw + readJsonl round-trip", async () => {
      const content = '{"a":1}\n{"b":2}\n';
      await storage.writeRaw("raw.jsonl", content);
      const records = await storage.readJsonl("raw.jsonl");
      expect(records).toEqual([{ a: 1 }, { b: 2 }]);
      await cleanup();
    });

    test("concurrent appendJsonl preserves all records", async () => {
      const promises = Array.from({ length: 50 }, (_, i) =>
        storage.appendJsonl("concurrent.jsonl", { i })
      );
      await Promise.all(promises);
      const records = await storage.readJsonl<{ i: number }>("concurrent.jsonl");
      expect(records.length).toBe(50);
      const indices = records.map((r) => r.i).sort((a, b) => a - b);
      expect(indices).toEqual(Array.from({ length: 50 }, (_, i) => i));
      await cleanup();
    });
  });
}

contractSuite("MemoryStorage", async () => ({
  storage: new MemoryStorage(),
  cleanup: async () => {},
}));

contractSuite("FsStorage", async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), "cfgm-test-"));
  return {
    storage: new FsStorage(tmpDir),
    cleanup: () => rm(tmpDir, { recursive: true, force: true }),
  };
});
