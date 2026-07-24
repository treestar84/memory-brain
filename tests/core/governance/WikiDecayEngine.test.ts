import { describe, test, expect } from "bun:test";
import { evaluateWikiDecay, type WikiDecayPageInput } from "../../../src/core/governance/WikiDecayEngine";
import type { PageStat } from "../../../src/core/stats/UsageLog";

const NOW = "2026-07-24T00:00:00.000Z";

function isoDaysAgo(days: number): string {
  return new Date(Date.parse(NOW) - days * 86_400_000).toISOString().slice(0, 10);
}

function page(overrides: Partial<WikiDecayPageInput> = {}): WikiDecayPageInput {
  return {
    id: "concept.example",
    type: "concept",
    status: "active",
    updatedAt: isoDaysAgo(0),
    path: "concepts/example.md",
    ...overrides,
  };
}

describe("evaluateWikiDecay", () => {
  test("status=draft, age > 14일 → stale-draft (경계값 15일)", () => {
    const findings = evaluateWikiDecay(
      [page({ status: "draft", updatedAt: isoDaysAgo(15) })],
      [],
      NOW,
    );
    expect(findings[0]!.tier).toBe("stale-draft");
    expect(findings[0]!.reasons.length).toBeGreaterThan(0);
  });

  test("status=draft, age = 14일 (경계) → stale-draft 아님", () => {
    const findings = evaluateWikiDecay(
      [page({ status: "draft", updatedAt: isoDaysAgo(14) })],
      [],
      NOW,
    );
    expect(findings[0]!.tier).not.toBe("stale-draft");
  });

  test("status=active, age > 90일 + 최근 30일 회상 0 → decay-candidate", () => {
    const findings = evaluateWikiDecay(
      [page({ status: "active", updatedAt: isoDaysAgo(91) })],
      [],
      NOW,
    );
    expect(findings[0]!.tier).toBe("decay-candidate");
  });

  test("status=active, age > 90일이어도 최근 30일 내 회상 있으면 decay-candidate 아님", () => {
    const stats: PageStat[] = [{ pageId: "concept.example", count: 3, lastTs: isoDaysAgo(5) }];
    const findings = evaluateWikiDecay(
      [page({ status: "active", updatedAt: isoDaysAgo(91) })],
      stats,
      NOW,
    );
    expect(findings[0]!.tier).not.toBe("decay-candidate");
    expect(findings[0]!.recalls).toBe(3);
  });

  test("status=active, age > 45일이지만 90일 이하 → aging", () => {
    const findings = evaluateWikiDecay(
      [page({ status: "active", updatedAt: isoDaysAgo(46) })],
      [],
      NOW,
    );
    expect(findings[0]!.tier).toBe("aging");
  });

  test("status=active, age = 45일 (경계) → aging 아님, fresh", () => {
    const findings = evaluateWikiDecay(
      [page({ status: "active", updatedAt: isoDaysAgo(45) })],
      [],
      NOW,
    );
    expect(findings[0]!.tier).toBe("fresh");
  });

  test("age = 90일 (경계) → decay-candidate 아님", () => {
    const findings = evaluateWikiDecay(
      [page({ status: "active", updatedAt: isoDaysAgo(90) })],
      [],
      NOW,
    );
    expect(findings[0]!.tier).not.toBe("decay-candidate");
  });

  test("updatedAt 파싱 불가 → tier unknown, 크래시하지 않는다", () => {
    const findings = evaluateWikiDecay(
      [page({ updatedAt: "not-a-date" })],
      [],
      NOW,
    );
    expect(findings[0]!.tier).toBe("unknown");
    expect(Number.isNaN(findings[0]!.ageDays)).toBe(true);
    expect(findings[0]!.reasons[0]).toContain("파싱 불가");
  });

  test("usage 데이터 없음 → recalls 0, lastRecallAt null", () => {
    const findings = evaluateWikiDecay([page()], [], NOW);
    expect(findings[0]!.recalls).toBe(0);
    expect(findings[0]!.lastRecallAt).toBeNull();
  });

  test("신선한 page (age 0일) → fresh", () => {
    const findings = evaluateWikiDecay([page({ updatedAt: isoDaysAgo(0) })], [], NOW);
    expect(findings[0]!.tier).toBe("fresh");
  });
});
