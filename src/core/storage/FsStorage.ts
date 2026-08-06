import type { Storage } from "./Storage";
import {
  appendFile,
  readFile,
  writeFile,
  readdir,
  stat,
  mkdir,
  unlink,
  rm,
} from "node:fs/promises";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parseJsonlLenient } from "./jsonl";
import { renameWithRetry } from "../util/atomicWrite";

export class FsStorage implements Storage {
  constructor(private readonly root: string) {}

  private resolve(path: string): string {
    return join(this.root, path);
  }

  async appendJsonl(path: string, record: unknown): Promise<void> {
    const full = this.resolve(path);
    await mkdir(dirname(full), { recursive: true });
    await appendFile(full, JSON.stringify(record) + "\n", { flag: "a" });
  }

  async rewriteJsonl(path: string, records: readonly unknown[]): Promise<void> {
    const full = this.resolve(path);
    await mkdir(dirname(full), { recursive: true });
    const body = records.map((r) => JSON.stringify(r)).join("\n");
    const tmp = full + ".tmp." + randomUUID().slice(0, 8);
    await writeFile(tmp, body.length > 0 ? body + "\n" : "");
    await renameWithRetry(tmp, full);
  }

  async readJsonl<T = unknown>(path: string): Promise<T[]> {
    try {
      const content = await readFile(this.resolve(path), "utf-8");
      return parseJsonlLenient<T>(content, path);
    } catch (e: any) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
  }

  async readJson<T = unknown>(path: string): Promise<T | null> {
    try {
      return JSON.parse(await readFile(this.resolve(path), "utf-8")) as T;
    } catch (e: any) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
  }

  async writeJsonAtomic(path: string, data: unknown): Promise<void> {
    const full = this.resolve(path);
    await mkdir(dirname(full), { recursive: true });
    const tmp = full + ".tmp." + randomUUID().slice(0, 8);
    await writeFile(tmp, JSON.stringify(data, null, 2));
    await renameWithRetry(tmp, full);
  }

  async writeRaw(path: string, content: string): Promise<void> {
    const full = this.resolve(path);
    await mkdir(dirname(full), { recursive: true });
    const tmp = full + ".tmp." + randomUUID().slice(0, 8);
    await writeFile(tmp, content);
    await renameWithRetry(tmp, full);
  }

  async readText(path: string): Promise<string | null> {
    try {
      return await readFile(this.resolve(path), "utf-8");
    } catch (e: any) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
  }

  async listFiles(dir: string, pattern?: string): Promise<string[]> {
    try {
      const entries = await readdir(this.resolve(dir));
      if (!pattern) return entries;
      const ext = pattern.replace("*", "");
      return entries.filter((e) => e.endsWith(ext));
    } catch (e: any) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
  }

  async exists(path: string): Promise<boolean> {
    return existsSync(this.resolve(path));
  }

  async ensureDir(path: string): Promise<void> {
    await mkdir(this.resolve(path), { recursive: true });
  }

  async fileSize(path: string): Promise<number> {
    try {
      return (await stat(this.resolve(path))).size;
    } catch {
      return 0;
    }
  }

  async delete(path: string): Promise<void> {
    try {
      await unlink(this.resolve(path));
    } catch (e: any) {
      if (e.code === "ENOENT") return;
      throw e;
    }
  }

  async listFilesRecursive(dir: string): Promise<string[]> {
    const results: string[] = [];
    const walk = async (current: string, prefix: string): Promise<void> => {
      let entries: string[];
      try {
        entries = await readdir(join(this.root, current));
      } catch (e: any) {
        if (e.code === "ENOENT") return;
        throw e;
      }
      for (const entry of entries) {
        const rel = prefix ? `${prefix}/${entry}` : entry;
        const full = join(this.root, current, entry);
        let s: Awaited<ReturnType<typeof stat>>;
        try { s = await stat(full); } catch { continue; }
        if (s.isDirectory()) {
          await walk(join(current, entry), rel);
        } else {
          results.push(`${dir}/${rel}`);
        }
      }
    };
    await walk(dir, "");
    return results;
  }

  async deleteDir(dir: string): Promise<void> {
    try {
      await rm(this.resolve(dir), { recursive: true, force: true });
    } catch (e: any) {
      if (e.code === "ENOENT") return;
      throw e;
    }
  }
}
