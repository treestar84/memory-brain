import { describe, test, expect } from "bun:test";
import {
  ROT_CHECKPOINTS,
  orderedHaystack,
  sliceAtCheckpoint,
  retrieveNaive,
  runRotBench,
  renderRotBenchReport,
} from "../../../src/core/bench/RotBench";
import { retrieveTopSessions, type LmeQuestion } from "../../../src/core/bench/LongMemEval";
import { HashedNgramEmbedder } from "../../../src/core/search/Embedder";

const embedder = new HashedNgramEmbedder();

function q(overrides: Partial<LmeQuestion>): LmeQuestion {
  return {
    question_id: "q1",
    question_type: "single-session-user",
    question: "What degree did I graduate with?",
    haystack_session_ids: ["s1", "s2", "s3", "s4"],
    haystack_dates: ["2023/01/10 (Tue)", "2023/03/05 (Sun)", "2023/02/01 (Wed)", "2023/04/20 (Thu)"],
    haystack_sessions: [
      [{ role: "user", content: "I graduated with a business administration degree last spring." }],
      [{ role: "user", content: "My cat knocked over the coffee mug again." }],
      [{ role: "user", content: "Planning a hiking trip to the mountains next month." }],
      [{ role: "user", content: "Quarterly report deadline is Friday." }],
    ],
    answer_session_ids: ["s1"],
    ...overrides,
  };
}

describe("RotBench (메모리 부패 벤치마크)", () => {
  test("orderedHaystack — 날짜 오름차순 정렬 (s1 01/10, s3 02/01, s2 03/05, s4 04/20)", () => {
    const ordered = orderedHaystack(q({}), "date");
    expect(ordered.map((r) => r.sid)).toEqual(["s1", "s3", "s2", "s4"]);
  });

  test("orderedHaystack — seed 순서는 원 배열 그대로", () => {
    const ordered = orderedHaystack(q({}), "seed");
    expect(ordered.map((r) => r.sid)).toEqual(["s1", "s2", "s3", "s4"]);
  });

  test("sliceAtCheckpoint — 체크포인트가 날짜순으로 앞쪽만 잘린다", () => {
    // 날짜순: s1(01/10) s3(02/01) s2(03/05) s4(04/20) — N=4
    const at25 = sliceAtCheckpoint(q({}), 0.25); // ceil(1) = 1개 → [s1]
    expect(at25?.haystack_session_ids).toEqual(["s1"]);
    const at50 = sliceAtCheckpoint(q({}), 0.5); // ceil(2) = 2개 → [s1, s3]
    expect(at50?.haystack_session_ids).toEqual(["s1", "s3"]);
    const at100 = sliceAtCheckpoint(q({}), 1.0);
    expect(at100?.haystack_session_ids?.sort()).toEqual(["s1", "s2", "s3", "s4"]);
  });

  test("sliceAtCheckpoint — answer 세션이 슬라이스에 없으면 null (skip)", () => {
    // 정답 s4(04/20) 는 체크포인트 0.25/0.5/0.75 에서 아직 등장 전
    const withLateAnswer = q({ answer_session_ids: ["s4"] });
    expect(sliceAtCheckpoint(withLateAnswer, 0.25)).toBeNull();
    expect(sliceAtCheckpoint(withLateAnswer, 0.5)).toBeNull();
    expect(sliceAtCheckpoint(withLateAnswer, 0.75)).toBeNull();
    expect(sliceAtCheckpoint(withLateAnswer, 1.0)).not.toBeNull();
  });

  test("sliceAtCheckpoint — 근거 라벨 없는 질문(abstention)은 항상 null", () => {
    expect(sliceAtCheckpoint(q({ answer_session_ids: [] }), 1.0)).toBeNull();
  });

  test("runRotBench — R@5/MRR 계산 정확성 (소형 합성 질문, 정답이 top에 명확히 잡힘)", () => {
    const result = runRotBench([q({})], { embedder, checkpoints: [1.0] });
    expect(result.evaluatedByCheckpoint[1.0]).toBe(1);
    expect(result.skippedByCheckpoint[1.0]).toBe(0);
    const governedCell = result.aggregates.find((c) => c.checkpoint === 1.0 && c.condition === "governed")!;
    expect(governedCell.caseCount).toBe(1);
    expect(governedCell.recallAt5).toBe(1); // 명확한 근거 — top-5 hit
    expect(governedCell.mrr).toBeGreaterThan(0);
    expect(governedCell.mrr).toBeLessThanOrEqual(1);
  });

  test("runRotBench — top-5 토큰 합 산출 (0 이상, case 존재 시 0 초과 가능)", () => {
    const result = runRotBench([q({})], { embedder, checkpoints: [1.0] });
    for (const c of result.aggregates) {
      expect(c.avgTop5Tokens).toBeGreaterThanOrEqual(0);
    }
    // hit 케이스는 최소 1개 세션 텍스트가 포함되므로 토큰 합 > 0
    const governedCell = result.aggregates.find((c) => c.checkpoint === 1.0 && c.condition === "governed")!;
    expect(governedCell.avgTop5Tokens).toBeGreaterThan(0);
  });

  test("runRotBench — question type 별 breakdown 집계", () => {
    const qs = [
      q({ question_id: "a", question_type: "single-session-user" }),
      q({ question_id: "b", question_type: "knowledge-update", answer_session_ids: ["s3"] }),
    ];
    const result = runRotBench(qs, { embedder, checkpoints: [1.0] });
    const types = new Set(result.byType.map((t) => t.questionType));
    expect(types.has("single-session-user")).toBe(true);
    expect(types.has("knowledge-update")).toBe(true);
    // 조건(naive/governed) × 체크포인트(1개) 이므로 타입별 2행씩
    expect(result.byType.filter((t) => t.questionType === "knowledge-update").length).toBe(2);
  });

  test("runRotBench — checkpoints 기본값은 ROT_CHECKPOINTS 4개", () => {
    const result = runRotBench([q({})], { embedder });
    expect(result.checkpoints).toEqual([...ROT_CHECKPOINTS].sort((a, b) => a - b));
  });

  test("naive 와 governed 는 실제로 다른 검색 경로를 탄다 (retrieveNaive vs retrieveTopSessions 결과 구조 비교)", () => {
    const question = q({});
    const naiveRanked = retrieveNaive(question, embedder, { depth: 10 });
    const governedRanked = retrieveTopSessions(question, embedder, { depth: 10, prf: true });
    // 둘 다 유효한 세션 id 랭킹을 반환하지만 서로 다른 함수·옵션 경로를 통과했다.
    expect(Array.isArray(naiveRanked)).toBe(true);
    expect(Array.isArray(governedRanked)).toBe(true);
    for (const sid of naiveRanked) expect(question.haystack_session_ids).toContain(sid);
    for (const sid of governedRanked) expect(question.haystack_session_ids).toContain(sid);
  });

  test("renderRotBenchReport — 정의·표·한계·재현 섹션 포함", () => {
    const result = runRotBench([q({})], { embedder, checkpoints: [1.0] });
    const md = renderRotBenchReport(result, "2026-07-24T00:00:00.000Z");
    expect(md).toContain("# Memory Rot Benchmark");
    expect(md).toContain("## 측정 정의");
    expect(md).toContain("## 체크포인트 × 조건");
    expect(md).toContain("## 한계 (threats to validity)");
    expect(md).toContain("세션 축적 강건성 측정이며 달력 경과 실측이 아니다");
    expect(md).toContain("naive 조건 정의의 한계");
    expect(md).toContain("## 재현");
    expect(md).toContain("cfgm rot-bench");
  });

  test("onProgress 콜백이 문항마다 호출된다", () => {
    const qs = [q({ question_id: "a" }), q({ question_id: "b" })];
    const calls: Array<[number, number]> = [];
    runRotBench(qs, { embedder, checkpoints: [1.0], onProgress: (done, total) => calls.push([done, total]) });
    expect(calls).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  describe("cohort 모드", () => {
    test("이른 체크포인트에서 answer 미포함 문항은 전체 제외된다 (cohortExcluded 카운트)", () => {
      // 정답 s4(04/20) 는 25/50/75% 체크포인트에서 아직 등장 전 — cohort 모드에서 전체 제외.
      const withLateAnswer = q({ question_id: "late", answer_session_ids: ["s4"] });
      const result = runRotBench([withLateAnswer], { embedder, cohort: true });
      expect(result.mode).toBe("cohort");
      expect(result.cohortExcluded).toBe(1);
      for (const f of result.checkpoints) {
        expect(result.evaluatedByCheckpoint[f]).toBe(0);
        expect(result.skippedByCheckpoint[f]).toBe(1);
      }
      expect(result.cases.length).toBe(0);
    });

    test("포함 문항은 4개 체크포인트 모두 평가되고 모든 체크포인트 n 이 동일하다", () => {
      // 정답 s1(01/10) 은 모든 체크포인트에 포함 — cohort 모드에서 4곳 모두 평가.
      const result = runRotBench([q({ question_id: "full" })], { embedder, cohort: true });
      expect(result.mode).toBe("cohort");
      expect(result.cohortExcluded).toBe(0);
      const ns = result.checkpoints.map((f) => result.evaluatedByCheckpoint[f]);
      expect(new Set(ns).size).toBe(1);
      expect(ns[0]).toBe(1);
      // naive+governed × 4 체크포인트 = 8 케이스
      expect(result.cases.length).toBe(8);
    });

    test("cohortExcluded 카운트 정확성 — 포함 1건 + 제외 1건 혼합", () => {
      const qs = [
        q({ question_id: "full", answer_session_ids: ["s1"] }),
        q({ question_id: "late", answer_session_ids: ["s4"] }),
        q({ question_id: "abstain", answer_session_ids: [] }),
      ];
      const result = runRotBench(qs, { embedder, cohort: true });
      expect(result.cohortExcluded).toBe(2); // late + abstain
      for (const f of result.checkpoints) {
        expect(result.evaluatedByCheckpoint[f]).toBe(1); // full 만 평가
      }
    });

    test("cohort=false(기본) 모드 결과는 기존 동작과 동일하다 (회귀 가드)", () => {
      const qs = [q({ question_id: "a" }), q({ question_id: "b", answer_session_ids: ["s4"] })];
      const withCohortFlag = runRotBench(qs, { embedder, checkpoints: [0.25, 0.5, 0.75, 1.0], cohort: false });
      const withoutCohortFlag = runRotBench(qs, { embedder, checkpoints: [0.25, 0.5, 0.75, 1.0] });
      expect(withCohortFlag.mode).toBe("all");
      expect(withoutCohortFlag.mode).toBe("all");
      expect(withCohortFlag.evaluatedByCheckpoint).toEqual(withoutCohortFlag.evaluatedByCheckpoint);
      expect(withCohortFlag.skippedByCheckpoint).toEqual(withoutCohortFlag.skippedByCheckpoint);
      expect(withCohortFlag.cases).toEqual(withoutCohortFlag.cases);
      expect(withCohortFlag.cohortExcluded).toBeUndefined();
    });
  });
});
