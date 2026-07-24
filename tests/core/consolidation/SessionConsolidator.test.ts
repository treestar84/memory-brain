import { describe, test, expect } from "bun:test";
import { consolidateSessions, type ConsolidationInputSession } from "../../../src/core/consolidation/SessionConsolidator";

const NEAR_DUP_A =
  "I graduated with a business administration degree from state university last spring after four years of study.";
const NEAR_DUP_B =
  "I graduated with a business administration degree from state university last spring after four years of study!";
const NEAR_DUP_C =
  "I graduated with a business administration degree from state university last spring after four year of study.";

const UNRELATED =
  "The quarterly financial report for the accounting team is due on Friday afternoon before the board meeting.";

describe("consolidateSessions", () => {
  test("거의 동일한 두 세션 — 구본이 최신본에 supersede 된다", () => {
    const sessions: ConsolidationInputSession[] = [
      { id: "s1", text: NEAR_DUP_A, date: "2023/01/10 (Tue)" },
      { id: "s2", text: NEAR_DUP_B, date: "2023/03/05 (Sun)" },
    ];
    const result = consolidateSessions(sessions);
    const s1 = result.sessions.find((s) => s.id === "s1")!;
    const s2 = result.sessions.find((s) => s.id === "s2")!;
    expect(s1.supersededBy).toBe("s2"); // s2 가 날짜상 최신
    expect(s2.supersededBy).toBeUndefined();
    expect(result.stats.superseded).toBe(1);
  });

  test("상이한 세션 — supersede 되지 않고 둘 다 생존", () => {
    const sessions: ConsolidationInputSession[] = [
      { id: "s1", text: NEAR_DUP_A, date: "2023/01/10 (Tue)" },
      { id: "s2", text: UNRELATED, date: "2023/03/05 (Sun)" },
    ];
    const result = consolidateSessions(sessions);
    expect(result.sessions.every((s) => s.supersededBy === undefined)).toBe(true);
    expect(result.stats.superseded).toBe(0);
  });

  test("3개 연쇄 근사중복 클러스터 — 최신 1개만 생존", () => {
    const sessions: ConsolidationInputSession[] = [
      { id: "s1", text: NEAR_DUP_A, date: "2023/01/10 (Tue)" },
      { id: "s2", text: NEAR_DUP_C, date: "2023/02/15 (Wed)" },
      { id: "s3", text: NEAR_DUP_B, date: "2023/03/05 (Sun)" },
    ];
    const result = consolidateSessions(sessions);
    const survivors = result.sessions.filter((s) => s.supersededBy === undefined);
    expect(survivors.length).toBe(1);
    expect(survivors[0]!.id).toBe("s3"); // 날짜상 최신
    expect(result.stats.superseded).toBe(2);
  });

  test("증류 — 상위 문장 수 상한(min(5, 30%)) 준수 + 원 순서 유지", () => {
    const sentences = Array.from(
      { length: 12 },
      (_, i) => `This is sentence number ${i} about hiking mountains camping and trail navigation topic ${i}.`,
    );
    const text = sentences.join(" ");
    const result = consolidateSessions([{ id: "long", text }]);
    const core = result.sessions[0]!.coreText;
    const coreSentences = core.split(/(?<=[.!?])\s+/).filter(Boolean);
    // 12문장의 30% = 3.6 → ceil = 4 (5 이하이므로 상한 4)
    expect(coreSentences.length).toBeLessThanOrEqual(5);
    expect(coreSentences.length).toBeGreaterThan(0);
    // 원 순서 유지 확인 — coreText 내 문장들의 원본 인덱스가 오름차순이어야 한다
    const indices = coreSentences.map((s) => {
      const m = /sentence number (\d+)/.exec(s);
      return m ? Number(m[1]) : -1;
    });
    const sorted = [...indices].sort((a, b) => a - b);
    expect(indices).toEqual(sorted);
  });

  test("증류 — 문장 3개 이하 세션은 원문 그대로 유지", () => {
    const text = "First sentence here. Second sentence here.";
    const result = consolidateSessions([{ id: "short", text }]);
    expect(result.sessions[0]!.coreText).toBe(text);
  });

  test("결정론 — 동일 입력 2회 호출 시 완전히 동일한 출력", () => {
    const sessions: ConsolidationInputSession[] = [
      { id: "s1", text: NEAR_DUP_A, date: "2023/01/10 (Tue)" },
      { id: "s2", text: NEAR_DUP_B, date: "2023/03/05 (Sun)" },
      { id: "s3", text: UNRELATED, date: "2023/02/01 (Wed)" },
    ];
    const r1 = consolidateSessions(sessions);
    const r2 = consolidateSessions(sessions);
    expect(r1).toEqual(r2);
  });

  test("stats — total/avgCompressionRatio 필드가 합리적 범위", () => {
    const sessions: ConsolidationInputSession[] = [
      { id: "s1", text: NEAR_DUP_A, date: "2023/01/10 (Tue)" },
      { id: "s2", text: UNRELATED, date: "2023/02/01 (Wed)" },
    ];
    const result = consolidateSessions(sessions);
    expect(result.stats.total).toBe(2);
    expect(result.stats.avgCompressionRatio).toBeGreaterThan(0);
    expect(result.stats.avgCompressionRatio).toBeLessThanOrEqual(1.01);
  });

  test("주제만 같고 문장이 다른 세션 쌍 — content-token TF 코사인이 낮아 supersede 안 됨", () => {
    const topicA =
      "Planning a hiking trip to the mountains next month with a group of friends. " +
      "We want to reserve a campsite near the ridge trail and check the weather forecast before we leave. " +
      "Someone needs to bring a first aid kit and extra water bottles.";
    const topicB =
      "Thinking about a weekend hike up north sometime soon. " +
      "My coworker suggested we look at cabins instead of tents this time. " +
      "I still need to buy new hiking boots before the trip.";
    const sessions: ConsolidationInputSession[] = [
      { id: "s1", text: topicA, date: "2023/01/10 (Tue)" },
      { id: "s2", text: topicB, date: "2023/02/01 (Wed)" },
    ];
    const result = consolidateSessions(sessions);
    expect(result.sessions.every((s) => s.supersededBy === undefined)).toBe(true);
    expect(result.stats.superseded).toBe(0);
  });

  test("소폭 편집본(문장 삭제 + 한 줄 추가) — 대부분 겹치므로 supersede 됨", () => {
    const baseSentences = [
      "I graduated with a business administration degree from state university last spring after four years of study.",
      "My favorite professor taught marketing strategy and case analysis.",
      "I plan to apply for jobs at consulting firms downtown.",
      "My parents attended the ceremony and took many photos.",
      "The whole class went out for dinner afterward to celebrate together.",
      "I already updated my resume with the new degree and internship experience.",
      "Next week I start studying for the certification exam in finance.",
      "My roommate helped me pack boxes for the move to a new apartment.",
      "I also joined an alumni networking group focused on business careers.",
    ];
    const original = baseSentences.join(" ");
    const editedSentences = [...baseSentences];
    editedSentences.splice(1, 1); // 문장 하나 삭제
    editedSentences.push("I am also considering a short trip before starting my new job."); // 한 줄 추가
    const edited = editedSentences.join(" ");

    const sessions: ConsolidationInputSession[] = [
      { id: "s1", text: original, date: "2023/01/10 (Tue)" },
      { id: "s2", text: edited, date: "2023/01/17 (Tue)" },
    ];
    const result = consolidateSessions(sessions);
    const s1 = result.sessions.find((s) => s.id === "s1")!;
    expect(s1.supersededBy).toBe("s2");
    expect(result.stats.superseded).toBe(1);
  });

  test("날짜 미상 세션이 섞인 클러스터에서도 결정론적으로 승자 선정", () => {
    const sessions: ConsolidationInputSession[] = [
      { id: "s1", text: NEAR_DUP_A },
      { id: "s2", text: NEAR_DUP_B },
    ];
    const result = consolidateSessions(sessions);
    // 둘 다 날짜 없음 → tie-break: 배열상 뒤쪽(index 1, s2)이 승자
    const s1 = result.sessions.find((s) => s.id === "s1")!;
    expect(s1.supersededBy).toBe("s2");
  });
});
