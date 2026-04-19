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

    test("delete removes existing file", async () => {
      await storage.writeJsonAtomic("to-delete.json", { x: 1 });
      expect(await storage.exists("to-delete.json")).toBe(true);
      await storage.delete("to-delete.json");
      expect(await storage.exists("to-delete.json")).toBe(false);
      await cleanup();
    });

    test("delete is no-op for missing file", async () => {
      await storage.delete("never-existed.json");
      expect(await storage.exists("never-existed.json")).toBe(false);
      await cleanup();
    });

    test("delete preserves sibling files", async () => {
      await storage.writeJsonAtomic("dir/keep.json", { a: 1 });
      await storage.writeJsonAtomic("dir/remove.json", { b: 2 });
      await storage.delete("dir/remove.json");
      expect(await storage.exists("dir/keep.json")).toBe(true);
      expect(await storage.exists("dir/remove.json")).toBe(false);
      await cleanup();
    });

    test("listFilesRecursive returns all nested files", async () => {
      await storage.writeJsonAtomic("tree/a/file1.json", { a: 1 });
      await storage.writeJsonAtomic("tree/b/file2.json", { b: 2 });
      await storage.writeJsonAtomic("tree/file3.json", { c: 3 });
      const files = await storage.listFilesRecursive("tree");
      expect(files).toHaveLength(3);
      expect(files.some((f) => f.endsWith("file1.json"))).toBe(true);
      expect(files.some((f) => f.endsWith("file2.json"))).toBe(true);
      expect(files.some((f) => f.endsWith("file3.json"))).toBe(true);
      await cleanup();
    });

    test("deleteDir removes all files under dir", async () => {
      await storage.writeJsonAtomic("to-delete/a.json", { a: 1 });
      await storage.writeJsonAtomic("to-delete/sub/b.json", { b: 2 });
      await storage.writeJsonAtomic("keep/c.json", { c: 3 });
      await storage.deleteDir("to-delete");
      expect(await storage.exists("to-delete/a.json")).toBe(false);
      expect(await storage.exists("to-delete/sub/b.json")).toBe(false);
      expect(await storage.exists("keep/c.json")).toBe(true);
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
