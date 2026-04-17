import { describe, test, expect } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");

describe("project skeleton", () => {
  const requiredDirs = [
    "src/core/events",
    "src/core/storage",
    "src/core/ledger",
    "src/core/normalizer",
    "src/core/binder",
    "src/core/security",
    "src/core/clock",
    "src/adapters/claude-code",
    "src/hooks",
    "bin",
    "fixtures/claude-code/v1",
    "tests/helpers",
  ];

  for (const dir of requiredDirs) {
    test(`${dir}/ exists`, () => {
      expect(existsSync(join(ROOT, dir))).toBe(true);
    });
  }

  test("package.json has correct name", async () => {
    const pkg = await Bun.file(join(ROOT, "package.json")).json();
    expect(pkg.name).toBe("cfgm-os");
  });
});
