import { describe, test, expect } from "bun:test";
import { resolve } from "node:path";

const CLI = resolve(import.meta.dir, "../../bin/cfgm-run.ts");

describe("cfgm-run CLI", () => {
  test("exits 3 with no args", async () => {
    const proc = Bun.spawn(["bun", CLI], { stderr: "pipe" });
    await proc.exited;
    expect(proc.exitCode).toBe(3);
  });

  test("exits 2 when skill slug not found", async () => {
    const proc = Bun.spawn(["bun", CLI, "--skill", "nonexistent-skill-xyz"], {
      stderr: "pipe",
    });
    await proc.exited;
    expect(proc.exitCode).toBe(2);
  });

  test("plan-generator mode outputs markdown plan", async () => {
    const proc = Bun.spawn(
      ["bun", CLI, "--skill", "app-store-screenshots"],
      { stdout: "pipe", stderr: "pipe" }
    );
    await proc.exited;
    const out = await new Response(proc.stdout).text();
    expect(proc.exitCode).toBe(0);
    expect(out).toContain("# Execution Plan");
    expect(out).toContain("app-store-screenshots");
  });

  test("--json flag outputs valid JSON", async () => {
    const proc = Bun.spawn(
      ["bun", CLI, "--skill", "app-store-screenshots", "--json"],
      { stdout: "pipe", stderr: "pipe" }
    );
    await proc.exited;
    const out = await new Response(proc.stdout).text();
    expect(proc.exitCode).toBe(0);
    expect(() => JSON.parse(out)).not.toThrow();
    const parsed = JSON.parse(out);
    expect(parsed.skillSlug).toBe("app-store-screenshots");
    expect(Array.isArray(parsed.steps)).toBe(true);
  });
});
