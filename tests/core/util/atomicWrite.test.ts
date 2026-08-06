import { describe, test, expect, afterEach } from "bun:test";
import { mkdtemp, rm, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileAtomic, renameWithRetry } from "../../../src/core/util/atomicWrite";

describe("writeFileAtomic", () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  test("파일을 그대로 쓴다", async () => {
    dir = await mkdtemp(join(tmpdir(), "atomic-write-"));
    const target = join(dir, "page.md");
    await writeFileAtomic(target, "hello world");
    expect(await readFile(target, "utf-8")).toBe("hello world");
  });

  test("기존 파일을 덮어쓴다", async () => {
    dir = await mkdtemp(join(tmpdir(), "atomic-write-"));
    const target = join(dir, "page.md");
    await writeFileAtomic(target, "v1");
    await writeFileAtomic(target, "v2");
    expect(await readFile(target, "utf-8")).toBe("v2");
  });

  test("성공 후 디렉토리에 임시파일이 남지 않는다", async () => {
    dir = await mkdtemp(join(tmpdir(), "atomic-write-"));
    const target = join(dir, "page.md");
    await writeFileAtomic(target, "content");
    const entries = await readdir(dir);
    expect(entries).toEqual(["page.md"]);
  });
});

describe("renameWithRetry (Windows EPERM/EBUSY 재시도, POSIX 경로는 동작 변화 0)", () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  test("POSIX(현재 플랫폼이 win32 가 아니면) — 재시도 경로 없이 그대로 rename", async () => {
    dir = await mkdtemp(join(tmpdir(), "rename-retry-"));
    const src = join(dir, "src.txt");
    const dest = join(dir, "dest.txt");
    await writeFile(src, "hello");
    await renameWithRetry(src, dest);
    expect(await readFile(dest, "utf-8")).toBe("hello");
  });

  test("존재하지 않는 src → 에러 전파", async () => {
    dir = await mkdtemp(join(tmpdir(), "rename-retry-"));
    await expect(renameWithRetry(join(dir, "nope.txt"), join(dir, "dest.txt"))).rejects.toThrow();
  });
});
