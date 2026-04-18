export interface Storage {
  appendJsonl(path: string, record: unknown): Promise<void>;
  readJsonl<T = unknown>(path: string): Promise<T[]>;
  readJson<T = unknown>(path: string): Promise<T | null>;
  writeJsonAtomic(path: string, data: unknown): Promise<void>;
  writeRaw(path: string, content: string): Promise<void>;
  readText(path: string): Promise<string | null>;
  listFiles(dir: string, pattern?: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
  ensureDir(path: string): Promise<void>;
  fileSize(path: string): Promise<number>;
}
