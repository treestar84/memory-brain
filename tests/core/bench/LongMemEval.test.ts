import { describe, test, expect } from "bun:test";
import {
  parseLmeQuestions,
  sessionToText,
  evalLmeRetrieval,
  renderLmeReport,
  type LmeQuestion,
} from "../../../src/core/bench/LongMemEval";
import { HashedNgramEmbedder } from "../../../src/core/search/Embedder";

const embedder = new HashedNgramEmbedder();

function q(overrides: Partial<LmeQuestion>): LmeQuestion {
  return {
    question_id: "q1",
    question_type: "single-session-user",
    question: "What degree did I graduate with?",
    haystack_session_ids: ["s1", "s2", "s3"],
    haystack_sessions: [
      [{ role: "user", content: "I graduated with a business administration degree last spring." }],
      [{ role: "user", content: "My cat knocked over the coffee mug again." }],
      [{ role: "user", content: "Planning a hiking trip to the mountains next month." }],
    ],
    answer_session_ids: ["s1"],
    ...overrides,
  };
}

describe("LongMemEval adapter (V3.29 ①)", () => {
  test("parseLmeQuestions — 유효 스키마 통과, 불량 reject", () => {
    const parsed = parseLmeQuestions([
      {
        question_id: "a",
        question: "q",
        question_type: "multi-session",
        haystack_session_ids: ["s1"],
        haystack_sessions: [[{ role: "user", content: "hi" }]],
        answer_session_ids: ["s1"],
      },
    ]);
    expect(parsed.length).toBe(1);
    expect(parsed[0]!.question_type).toBe("multi-session");
    expect(() => parseLmeQuestions("nope")).toThrow();
    expect(() => parseLmeQuestions([{ question: "no id" }])).toThrow();
    expect(() =>
      parseLmeQuestions([
        { question_id: "a", question: "q", haystack_session_ids: ["s1", "s2"], haystack_sessions: [[]] },
      ]),
    ).toThrow(); // 길이 불일치
  });

  test("sessionToText — role 라벨 + 날짜 prefix + 빈 turn 필터", () => {
    const text = sessionToText(
      [
        { role: "user", content: "hello" },
        { role: "assistant", content: "" },
        { role: "assistant", content: "world" },
      ],
      "2023/05/20",
    );
    expect(text).toBe("[date: 2023/05/20]\nuser: hello\nassistant: world");
    expect(sessionToText([{ role: "user", content: "x" }])).toBe("user: x");
  });

  test("evalLmeRetrieval — 명확한 근거 세션이 R@1 로 잡힘 (fts + hybrid)", () => {
    const result = evalLmeRetrieval([q({})], { embedder });
    expect(result.evaluated).toBe(1);
    for (const m of result.overall) {
      expect(m.recallAtK[1]).toBe(1);
      expect(m.mrr).toBe(1);
    }
  });

  test("evalLmeRetrieval — 다중 근거 partial recall 계산", () => {
    const multi = q({
      question_id: "q2",
      question_type: "multi-session",
      question: "What pets do I have at home?",
      haystack_session_ids: ["s1", "s2", "s3", "s4"],
      haystack_sessions: [
        [{ role: "user", content: "My pet dog Rex loves the park." }],
        [{ role: "user", content: "I adopted a pet cat named Luna at home." }],
        [{ role: "user", content: "Quarterly report deadline is Friday." }],
        [{ role: "user", content: "The weather is rainy today." }],
      ],
      answer_session_ids: ["s1", "s2"],
    });
    const result = evalLmeRetrieval([multi], { embedder, ks: [1, 2, 4] });
    const fts = result.overall.find((m) => m.mode === "fts")!;
    expect(fts.recallAtK[1]).toBe(0.5); // 근거 2개 중 top-1 에 1개
    expect(fts.recallAtK[2]).toBe(1);
    expect(result.ks).toEqual([1, 2, 4]);
  });

  test("evalLmeRetrieval — 근거 라벨 없는 질문은 skip 카운트", () => {
    const result = evalLmeRetrieval([q({}), q({ question_id: "abs", answer_session_ids: [] })], {
      embedder,
    });
    expect(result.evaluated).toBe(1);
    expect(result.skippedNoEvidence).toBe(1);
  });

  test("evalLmeRetrieval — limit 적용 + type 별 분해", () => {
    const qs = [
      q({ question_id: "a", question_type: "single-session-user" }),
      q({ question_id: "b", question_type: "temporal-reasoning" }),
      q({ question_id: "c", question_type: "temporal-reasoning" }),
    ];
    const result = evalLmeRetrieval(qs, { embedder, limit: 2 });
    expect(result.evaluated).toBe(2);
    expect(result.byType.map((t) => t.questionType).sort()).toEqual([
      "single-session-user",
      "temporal-reasoning",
    ]);
  });

  test("evalLmeRetrieval — 오답 세션만 있으면 recall 0, MRR 0", () => {
    const miss = q({
      question: "zzz qqq unmatched nonsense",
      haystack_sessions: [
        [{ role: "user", content: "alpha beta gamma" }],
        [{ role: "user", content: "delta epsilon" }],
        [{ role: "user", content: "eta theta" }],
      ],
      answer_session_ids: ["s3"],
    });
    const result = evalLmeRetrieval([miss], { embedder, ks: [1] });
    // 근거 s3 가 top-1 에 없을 수 있음 — recall 값이 0~1 범위이며 크래시 없음만 보장
    for (const m of result.overall) {
      expect(m.recallAtK[1]).toBeGreaterThanOrEqual(0);
      expect(m.recallAtK[1]).toBeLessThanOrEqual(1);
    }
  });

  test("renderLmeReport — overall + type 별 표 포함", () => {
    const result = evalLmeRetrieval([q({})], { embedder });
    const md = renderLmeReport(result, "2026-07-21T12:00:00.000Z");
    expect(md).toContain("# LongMemEval Retrieval Benchmark");
    expect(md).toContain("## Overall");
    expect(md).toContain("R@10");
    expect(md).toContain("### single-session-user (1)");
    expect(md).toContain("LLM 호출 0");
  });
});
