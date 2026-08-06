import { describe, test, expect } from "bun:test";
import { toPosixPath } from "../../../src/core/util/path";

describe("toPosixPath", () => {
  test("역슬래시 구분 경로를 슬래시로 정규화", () => {
    expect(toPosixPath("concepts\\_ssl\\foo.json")).toBe("concepts/_ssl/foo.json");
    expect(toPosixPath(".claude\\skills\\example\\SKILL.md")).toBe(".claude/skills/example/SKILL.md");
  });

  test("이미 슬래시인 경로는 그대로", () => {
    expect(toPosixPath("concepts/_ssl/foo.json")).toBe("concepts/_ssl/foo.json");
  });

  test("구분자 없는 파일명은 그대로", () => {
    expect(toPosixPath("SKILL.md")).toBe("SKILL.md");
  });
});
