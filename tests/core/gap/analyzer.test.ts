import { describe, test, expect } from "bun:test";
import { GapAnalyzer } from "../../../src/core/gap/GapAnalyzer";
import { OrphanActionDetector } from "../../../src/core/gap/detectors/OrphanActionDetector";
import { FakeClock } from "../../../src/core/clock/Clock";
import type { FlowGraph, FlowBlock } from "../../../src/core/flow/types";

const mkBlock = (over: Partial<FlowBlock>): FlowBlock => ({
  blockId: "x",
  problemId: "p",
  type: "Action",
  status: "confirmed",
  label: "x",
  confidence: 0.8,
  supportedBy: [],
  relations: [],
  createdAt: "2026-04-18T00:00:00Z",
  lastConfirmedAt: null,
  staleAfter: null,
  supersededBy: null,
  bundleId: "bnd",
  ...over,
});

const mkGraph = (blocks: FlowBlock[]): FlowGraph => ({
  problemId: "p",
  blocks,
  cueCardMeta: { lastSyntheticAt: null, bodyHash: null, bodyBytes: 0, stale: false },
});

describe("GapAnalyzer", () => {
  const clock = new FakeClock(new Date("2026-04-18T10:00:00Z"));

  test("생성한 Gap 블록의 blockId 규약: gap:detectorId:subjectBlockId", () => {
    const analyzer = new GapAnalyzer([new OrphanActionDetector()]);
    const graph = mkGraph([mkBlock({ blockId: "a1", type: "Action" })]);
    const gaps = analyzer.analyze(graph, clock);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].blockId).toBe("gap:rule:orphan-action:a1");
    expect(gaps[0].type).toBe("Gap");
    expect(gaps[0].detectorId).toBe("rule:orphan-action");
    expect(gaps[0].subject?.blockId).toBe("a1");
  });

  test("예외 발생 detector는 격리, 다른 detector는 정상 동작", () => {
    const throwing = {
      id: "rule:bad",
      severity: 0.5,
      detect: () => {
        throw new Error("boom");
      },
    };
    const errors: unknown[] = [];
    const analyzer = new GapAnalyzer([throwing, new OrphanActionDetector()], {
      onError: (e) => errors.push(e),
    });
    const graph = mkGraph([mkBlock({ blockId: "a1", type: "Action" })]);
    const gaps = analyzer.analyze(graph, clock);
    expect(gaps).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });

  test("의미적 Gap(delta-added)은 analyzer 결과와 병합 가능", () => {
    const analyzer = new GapAnalyzer([new OrphanActionDetector()]);
    const existing = mkBlock({
      blockId: "gap:semantic:x",
      type: "Gap",
      detectorId: "semantic",
      subject: { blockId: "x" },
      severity: 0.6,
    });
    const graph = mkGraph([existing, mkBlock({ blockId: "a1", type: "Action" })]);
    const gaps = analyzer.analyze(graph, clock);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].blockId).toBe("gap:rule:orphan-action:a1");
  });

  test("동일 blockId 중복 시 첫 번째만 보존", () => {
    const d1 = {
      id: "rule:dup",
      severity: 0.5,
      detect: () => [
        { detectorId: "rule:dup" as const, subjectBlockId: "x", severity: 0.5, label: "first" },
      ],
    };
    const d2 = {
      id: "rule:dup2",
      severity: 0.5,
      detect: () => [
        { detectorId: "rule:dup" as const, subjectBlockId: "x", severity: 0.5, label: "second" },
      ],
    };
    // deno-lint-ignore no-explicit-any
    const analyzer = new GapAnalyzer([d1 as any, d2 as any]);
    const gaps = analyzer.analyze(mkGraph([]), clock);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].label).toBe("first");
  });
});
