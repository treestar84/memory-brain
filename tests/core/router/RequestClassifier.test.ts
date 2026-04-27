import { describe, test, expect } from "bun:test";
import { RequestClassifier } from "../../../src/core/router/RequestClassifier";

describe("RequestClassifier", () => {
  const c = new RequestClassifier();

  test("DEEP — '아키텍처 분석' 한국어 매치", () => {
    const r = c.classify("이 시스템 아키텍처를 분석해줘");
    expect(r.categories).toContain("DEEP");
  });

  test("PROJECT — 'PR-V3.3' 매치", () => {
    const r = c.classify("PR-V3.3 어디까지 됐어?");
    expect(r.categories).toContain("PROJECT");
  });

  test("PERSONAL — '내 선호' 매치", () => {
    const r = c.classify("내 선호 스타일대로 작성해줘");
    expect(r.categories).toContain("PERSONAL");
  });

  test("VERIFY — '근거 확인' 매치", () => {
    const r = c.classify("이 결정의 근거를 확인하고싶어");
    expect(r.categories).toContain("VERIFY");
  });

  test("WRITE — '저장' 매치", () => {
    const r = c.classify("이 결정 저장해줘");
    expect(r.categories).toContain("WRITE");
  });

  test("CODE — file extension 매치", () => {
    const r = c.classify("src/core/router/Router.ts 의 분기 점검");
    expect(r.categories).toContain("CODE");
  });

  test("RESEARCH — URL 매치", () => {
    const r = c.classify("https://github.com/getzep/graphiti 비교");
    expect(r.categories).toContain("RESEARCH");
  });

  test("CONFLICT — '충돌' 매치", () => {
    const r = c.classify("이전 결정과 충돌하지 않나?");
    expect(r.categories).toContain("CONFLICT");
  });

  test("MAINTENANCE — '정리' 매치", () => {
    const r = c.classify("memory 정리 부탁");
    expect(r.categories).toContain("MAINTENANCE");
  });

  test("QUICK fallback — 짧고 매치 없음", () => {
    const r = c.classify("ok");
    expect(r.categories).toEqual(["QUICK"]);
  });

  test("DEEP fallback — 길지만 매치 없음 → 보수적 DEEP", () => {
    const r = c.classify("음, 무언가 막연한 긴 문장이지만 키워드는 안 들어있어 알 수 없는 어떤 답을 해야 좋을까");
    expect(r.categories).toEqual(["DEEP"]);
  });

  test("다중 카테고리 — CODE + WRITE 동시 매치", () => {
    const r = c.classify("이 함수 구현 후 결과 저장해줘");
    expect(r.categories).toContain("CODE");
    expect(r.categories).toContain("WRITE");
  });

  test("evidence — matched pattern 노출", () => {
    const r = c.classify("아키텍처 분석");
    expect(r.evidence.length).toBeGreaterThan(0);
    expect(r.evidence[0]!.category).toBe("DEEP");
  });
});
