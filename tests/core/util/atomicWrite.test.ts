import { describe, test, expect, afterEach } from "bun:test";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileAtomic } from "../../../src/core/util/atomicWrite";

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
