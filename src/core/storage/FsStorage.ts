import type { Storage } from "./Storage";
import {
  appendFile,
  readFile,
  writeFile,
  readdir,
  stat,
  mkdir,
  rename,
} from "node:fs/promises";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";

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

  async readJsonl<T = unknown>(path: string): Promise<T[]> {
    try {
      const content = await readFile(this.resolve(path), "utf-8");
      return content.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as T);
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
    await rename(tmp, full);
  }

  async writeRaw(path: string, content: string): Promise<void> {
    const full = this.resolve(path);
    await mkdir(dirname(full), { recursive: true });
    const tmp = full + ".tmp." + randomUUID().slice(0, 8);
    await writeFile(tmp, content);
    await rename(tmp, full);
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
}
