import { readFileSync } from "node:fs";
import { join } from "node:path";

const FIXTURE_ROOT = join(import.meta.dir, "../../fixtures");

export function loadFixture<T = unknown>(platform: string, version: string, name: string): T {
  const path = join(FIXTURE_ROOT, platform, version, `${name}.json`);
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

export function claudeCodeFixture<T = unknown>(name: string): T {
  return loadFixture<T>("claude-code", "v1", name);
}
