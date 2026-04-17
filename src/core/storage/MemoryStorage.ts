import type { Storage } from "./Storage";

export class MemoryStorage implements Storage {
  private files = new Map<string, string>();

  async appendJsonl(path: string, record: unknown): Promise<void> {
    const existing = this.files.get(path) ?? "";
    this.files.set(path, existing + JSON.stringify(record) + "\n");
  }

  async readJsonl<T = unknown>(path: string): Promise<T[]> {
    const content = this.files.get(path);
    if (!content) return [];
    return content.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as T);
  }

  async readJson<T = unknown>(path: string): Promise<T | null> {
    const content = this.files.get(path);
    if (content === undefined) return null;
    return JSON.parse(content) as T;
  }

  async writeJsonAtomic(path: string, data: unknown): Promise<void> {
    this.files.set(path, JSON.stringify(data, null, 2));
  }

  async writeRaw(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async listFiles(dir: string, pattern?: string): Promise<string[]> {
    const prefix = dir.endsWith("/") ? dir : dir + "/";
    const results: string[] = [];
    for (const key of this.files.keys()) {
      if (!key.startsWith(prefix)) continue;
      const relative = key.slice(prefix.length);
      if (relative.includes("/")) continue;
      if (pattern) {
        const ext = pattern.replace("*", "");
        if (!relative.endsWith(ext)) continue;
      }
      results.push(relative);
    }
    return results;
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async ensureDir(_path: string): Promise<void> {}

  async fileSize(path: string): Promise<number> {
    const content = this.files.get(path);
    if (content === undefined) return 0;
    return new TextEncoder().encode(content).length;
  }
}
