import { describe, test, expect } from "bun:test";
import { slugify, capSlugLength, guardReservedName, MAX_SLUG_CHARS } from "../../../src/core/util/slug";

describe("slugify", () => {
  test("ASCII 입력 — 기존 동작 유지 (회귀)", () => {
    expect(slugify("session-sess-001")).toBe("session-sess-001");
    expect(slugify("My Flow!")).toBe("my-flow");
    expect(slugify("path with spaces")).toBe("path-with-spaces");
    expect(slugify("a__b--c")).toBe("a__b-c");
  });

  test("한글 slug 붕괴 버그 회귀 — 가-힣 보존", () => {
    expect(slugify("한글배포워크플로우")).toBe("한글배포워크플로우");
    expect(slugify("설계결정")).toBe("설계결정");
    expect(slugify("My Flow! 테스트")).toBe("my-flow-테스트");
  });

  test("빈 입력/순수 특수문자 → fallback", () => {
    expect(slugify("")).toBe("unnamed");
    expect(slugify("!!!")).toBe("unnamed");
    expect(slugify("", "capture")).toBe("capture");
    expect(slugify("###", "workflow")).toBe("workflow");
  });

  test("길이 상한 — 80자 초과 시 절단", () => {
    const long = "가".repeat(200);
    const result = slugify(long);
    expect([...result].length).toBeLessThanOrEqual(MAX_SLUG_CHARS);
  });

  test("Windows 예약어 충돌 시 접미사 부가", () => {
    expect(slugify("con")).toBe("con-x");
    expect(slugify("CON")).toBe("con-x");
    expect(slugify("lpt1")).toBe("lpt1-x");
    expect(slugify("nul")).toBe("nul-x");
    expect(slugify("console")).toBe("console"); // 예약어 접두어만 매치, 전체 매치만 차단
  });
});

describe("capSlugLength", () => {
  test("상한 이내면 그대로", () => {
    expect(capSlugLength("short", 80)).toBe("short");
  });

  test("절단 후 trailing dash 제거", () => {
    expect(capSlugLength("aaa-bbb", 5)).toBe("aaa-b");
    expect(capSlugLength("aaaa-", 4)).toBe("aaaa");
  });
});

describe("guardReservedName", () => {
  test("예약어면 접미사, 아니면 그대로", () => {
    expect(guardReservedName("com1")).toBe("com1-x");
    expect(guardReservedName("COM1")).toBe("COM1-x");
    expect(guardReservedName("regular")).toBe("regular");
  });
});
