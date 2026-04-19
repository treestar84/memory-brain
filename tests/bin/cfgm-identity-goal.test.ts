import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";

const CLI = join(import.meta.dir, "../../bin/cfgm-identity-goal.ts");
const INSTALL = join(import.meta.dir, "../../bin/install-brain.ts");

function run(args: string[], env: Record<string, string>) {
  return Bun.spawnSync({
    cmd: ["bun", "run", CLI, ...args],
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
}

describe("cfgm-identity-goal", () => {
  let fakeHome: string;
  let brainHome: string;
  let project: string;
  let env: Record<string, string>;
  let goalsDir: string;

  beforeEach(async () => {
    fakeHome = await mkdtemp(join(tmpdir(), "cfgm-goal-"));
    brainHome = join(fakeHome, ".claude-brain");
    project = join(fakeHome, "project");
    await mkdir(project, { recursive: true });
    env = {
      HOME: fakeHome,
      CFGM_PROJECT: project,
      CFGM_BRAIN_HOME: brainHome,
    };
    goalsDir = join(brainHome, "memory-brain", "identity", "goals");

    // install scaffold so identity/ + goals/_index.md exist
    Bun.spawnSync({
      cmd: ["bun", "run", INSTALL],
      env: { ...process.env, ...env },
      stdout: "pipe",
      stderr: "pipe",
    });
  });

  afterEach(async () => {
    await rm(fakeHome, { recursive: true, force: true });
  });

  test("G1: add creates goal file + updates _index.md", async () => {
    const proc = run(["add", "Rust 숙련", "learn-rust"], env);
    expect(proc.exitCode).toBe(0);
    const goalPath = join(goalsDir, "learn-rust.md");
    expect(existsSync(goalPath)).toBe(true);
    const content = await readFile(goalPath, "utf-8");
    expect(content).toContain("id: learn-rust");
    expect(content).toContain("title: Rust 숙련");
    expect(content).toContain("status: planned");

    const index = await readFile(join(goalsDir, "_index.md"), "utf-8");
    expect(index).toContain("Rust 숙련");
    expect(index).toContain("learn-rust");
    expect(index).toContain("<!-- GOALS-INDEX:BEGIN auto-generated -->");
    expect(index).toContain("<!-- GOALS-INDEX:END -->");
  });

  test("G2: rejects invalid id", async () => {
    const proc = run(["add", "X", "Bad ID With Spaces"], env);
    expect(proc.exitCode).toBe(2);
    expect(proc.stderr.toString()).toContain("잘못된 id");
  });

  test("G3: add is non-duplicating", async () => {
    run(["add", "X", "goal-x"], env);
    const proc = run(["add", "Y", "goal-x"], env);
    expect(proc.exitCode).toBe(2);
    expect(proc.stderr.toString()).toContain("이미 존재");
  });

  test("G4: done transitions status and sets completedAt", async () => {
    run(["add", "T", "goal-t"], env);
    const proc = run(["done", "goal-t"], env);
    expect(proc.exitCode).toBe(0);
    const content = await readFile(join(goalsDir, "goal-t.md"), "utf-8");
    expect(content).toContain("status: done");
    expect(content).toMatch(/completedAt: \d{4}-/);
  });

  test("G5: link without existing problem warns but persists soft-ref", async () => {
    run(["add", "T", "goal-link"], env);
    const proc = run(["link", "goal-link", "prob-missing"], env);
    expect(proc.exitCode).toBe(0);
    expect(proc.stderr.toString()).toContain("프로젝트에서 찾지 못함");
    const content = await readFile(join(goalsDir, "goal-link.md"), "utf-8");
    expect(content).toContain("prob-missing");
  });

  test("G6: link with existing problem does not warn", async () => {
    // seed a project state with a problem
    const stateDir = join(project, ".memory-brain", "state");
    await mkdir(stateDir, { recursive: true });
    const state = { activeId: "prob-abc", problems: [{ id: "prob-abc", title: "x", slug: "x", createdAt: "2026-01-01", lastConfirmedAt: "2026-01-01" }] };
    await writeFile(join(stateDir, "active-problem.json"), JSON.stringify(state));

    run(["add", "T", "goal-real"], env);
    const proc = run(["link", "goal-real", "prob-abc"], env);
    expect(proc.exitCode).toBe(0);
    expect(proc.stderr.toString()).not.toContain("찾지 못함");
  });

  test("G7: list shows all goals", async () => {
    run(["add", "A", "goal-a"], env);
    run(["add", "B", "goal-b"], env);
    const proc = run(["list"], env);
    expect(proc.exitCode).toBe(0);
    const out = proc.stdout.toString();
    expect(out).toContain("goal-a");
    expect(out).toContain("goal-b");
  });

  test("G8: show reports total bytes and goal count", async () => {
    run(["add", "A", "goal-a"], env);
    const proc = run(["show"], env);
    expect(proc.exitCode).toBe(0);
    const out = proc.stdout.toString();
    expect(out).toMatch(/총 크기: \d+ bytes/);
    expect(out).toContain("goals: 1개");
  });

  test("G9: show warns when identity exceeds 20KB budget", async () => {
    // inflate telos.md past 20KB
    const telosPath = join(brainHome, "memory-brain", "identity", "telos.md");
    await writeFile(telosPath, "x".repeat(25 * 1024));
    const proc = run(["show"], env);
    expect(proc.exitCode).toBe(0);
    expect(proc.stderr.toString()).toContain("권장 예산");
  });

  test("G10: _index.md groups by status", async () => {
    run(["add", "A", "goal-a"], env);
    run(["add", "B", "goal-b"], env);
    run(["done", "goal-b"], env);
    const index = await readFile(join(goalsDir, "_index.md"), "utf-8");
    expect(index).toContain("계획됨 (1)");
    expect(index).toContain("완료 (1)");
  });
});
