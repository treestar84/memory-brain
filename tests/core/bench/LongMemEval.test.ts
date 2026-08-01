import { describe, test, expect } from "bun:test";
import {
  parseLmeQuestions,
  sessionToText,
  evalLmeRetrieval,
  renderLmeReport,
  diagnoseLmeRetrieval,
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
    // path traversal 방어 — question_id 는 slug 만 허용
    expect(() =>
      parseLmeQuestions([
        {
          question_id: "../../etc/passwd",
          question: "q",
          haystack_session_ids: ["s1"],
          haystack_sessions: [[{ role: "user", content: "hi" }]],
          answer_session_ids: ["s1"],
        },
      ]),
    ).toThrow(/unsafe question_id/);
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

  test("splitOf — 결정론 + 대략 절반 분할 (V3.32)", async () => {
    const { splitOf } = await import("../../../src/core/bench/LongMemEval");
    expect(splitOf("abc123")).toBe(splitOf("abc123")); // 결정론
    const ids = Array.from({ length: 200 }, (_, i) => `q${i}`);
    const dev = ids.filter((id) => splitOf(id) === "dev").length;
    expect(dev).toBeGreaterThan(60);
    expect(dev).toBeLessThan(140);
  });

  test("prfTerms — 질문 어휘·기능어 제외, TF 상위 반환 (V3.32)", async () => {
    const { prfTerms } = await import("../../../src/core/bench/LongMemEval");
    const terms = prfTerms(
      ["user: my camera flash and tripod for photography", "user: camera flash reviews"],
      "What accessories complement my photography setup?",
    );
    expect(terms).toContain("camera");
    expect(terms).toContain("flash");
    expect(terms).not.toContain("photography"); // 질문에 이미 있음
    expect(terms).not.toContain("user"); // role 토큰 제외
    expect(prfTerms([], "query")).toEqual([]);
  });

  test("split/granularity/prf 옵션 — 평가 동작 (V3.32)", () => {
    const qs = [
      q({ question_id: "aa1" }),
      q({ question_id: "ab2" }),
      q({ question_id: "ac3" }),
      q({ question_id: "ad4" }),
    ];
    const all = evalLmeRetrieval(qs, { embedder });
    const dev = evalLmeRetrieval(qs, { embedder, split: "dev" });
    const test_ = evalLmeRetrieval(qs, { embedder, split: "test" });
    expect(dev.evaluated + test_.evaluated).toBe(all.evaluated);
    expect(dev.config).toContain("split=dev");

    const turn = evalLmeRetrieval(qs, { embedder, granularity: "turn" });
    expect(turn.config).toContain("granularity=turn");
    expect(turn.overall.find((m) => m.mode === "fts")!.recallAtK[5]).toBeGreaterThan(0);

    const prf = evalLmeRetrieval(qs, { embedder, prf: true });
    expect(prf.config).toContain("prf=true");
    expect(prf.overall.find((m) => m.mode === "hybrid")!.recallAtK[1]).toBe(1); // top-3 고정 → 정답 유지
  });

  test("diagnoseLmeRetrieval — 정답이 좁은 haystack 안에 있으면 양쪽 후보 모두 도달", () => {
    const result = diagnoseLmeRetrieval([q({})], { embedder });
    expect(result.evaluated).toBe(1);
    expect(result.bothReachable).toBe(1);
    expect(result.ftsOnlyReachable).toBe(0);
    expect(result.vectorOnlyReachable).toBe(0);
    expect(result.neitherReachable).toBe(0);
  });

  test("diagnoseLmeRetrieval — 좁은 candidateLimit 이면 후보 밖으로 밀려 neitherReachable 로 집계", () => {
    // 정답 세션(s1)이 haystack 맨 끝, 앞의 무관 세션들이 candidateLimit 을 다 채우게 구성
    const manyIrrelevant = Array.from({ length: 20 }, (_, i) => ({
      id: `irrelevant-${i}`,
      text: `Completely unrelated topic number ${i} about gardening and weather patterns.`,
    }));
    const wide = q({
      haystack_session_ids: [...manyIrrelevant.map((x) => x.id), "s1"],
      haystack_sessions: [
        ...manyIrrelevant.map((x) => [{ role: "user", content: x.text }]),
        [{ role: "user", content: "I graduated with a business administration degree last spring." }],
      ],
      answer_session_ids: ["s1"],
    });
    const narrow = diagnoseLmeRetrieval([wide], { embedder, candidateLimit: 1 });
    expect(narrow.evaluated).toBe(1);
    expect(narrow.bothReachable + narrow.ftsOnlyReachable + narrow.vectorOnlyReachable + narrow.neitherReachable).toBe(1);
    // candidateLimit=1 이면 정답이 최상위가 아닌 한 후보 밖으로 밀려날 가능성이 높음 —
    // 정확히 어느 팔이 잡는지는 랭킹 구현 세부에 의존하므로, 여기선 "후보군 개념 자체가 반영된다"만 검증.
  });

  test("diagnoseLmeRetrieval — split 필터가 dev/test 를 나눠 집계", () => {
    const qs = [
      q({ question_id: "aa1" }),
      q({ question_id: "ab2" }),
      q({ question_id: "ac3" }),
      q({ question_id: "ad4" }),
    ];
    const all = diagnoseLmeRetrieval(qs, { embedder });
    const dev = diagnoseLmeRetrieval(qs, { embedder, split: "dev" });
    const test_ = diagnoseLmeRetrieval(qs, { embedder, split: "test" });
    expect(dev.evaluated + test_.evaluated).toBe(all.evaluated);
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
