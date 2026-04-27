import { describe, test, expect } from "bun:test";
import { LaneSelector } from "../../../src/core/router/LaneSelector";

describe("LaneSelector", () => {
  const s = new LaneSelector();

  test("QUICK → lane 없음", () => {
    const r = s.select(["QUICK"]);
    expect(r.lanes).toEqual([]);
    expect(r.reason).toContain("불요");
  });

  test("DEEP → concept + decision + persona", () => {
    const r = s.select(["DEEP"]);
    expect(r.lanes).toContain("concept");
    expect(r.lanes).toContain("decision");
    expect(r.lanes).toContain("persona");
  });

  test("PROJECT → current + project", () => {
    const r = s.select(["PROJECT"]);
    expect(r.lanes).toEqual(["current", "project"]);
  });

  test("PERSONAL → persona", () => {
    const r = s.select(["PERSONAL"]);
    expect(r.lanes).toEqual(["persona"]);
  });

  test("CODE → current + project + code", () => {
    const r = s.select(["CODE"]);
    expect(r.lanes).toContain("code");
    expect(r.lanes).toContain("current");
    expect(r.lanes).toContain("project");
  });

  test("MAINTENANCE → governance", () => {
    const r = s.select(["MAINTENANCE"]);
    expect(r.lanes).toEqual(["governance"]);
  });

  test("다중 카테고리 union — CODE + WRITE", () => {
    const r = s.select(["CODE", "WRITE"]);
    expect(r.lanes).toContain("current");
    expect(r.lanes).toContain("project");
    expect(r.lanes).toContain("code");
    expect(r.lanes).toContain("concept");
    expect(r.lanes).toContain("decision");
    // 중복 제거
    const unique = new Set(r.lanes);
    expect(unique.size).toBe(r.lanes.length);
  });

  test("빈 카테고리 → 빈 lane", () => {
    const r = s.select([]);
    expect(r.lanes).toEqual([]);
  });
});
