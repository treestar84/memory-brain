import { describe, test, expect } from "bun:test";
import { runExternalAdapter, type RotAdapterRequest } from "../../../src/core/bench/RotAdapter";
import { runRotBenchAsync, type RotBenchOpts } from "../../../src/core/bench/RotBench";
import type { LmeQuestion } from "../../../src/core/bench/LongMemEval";
import { HashedNgramEmbedder } from "../../../src/core/search/Embedder";

/**
 * 스텁 어댑터는 `bun -e "<inline script>"` 로 spawn — 별도 fixture 파일 없이
 * 테스트 목적에 맞는 최소 동작을 각 테스트에서 정의한다.
 * `for await (const line of console)` 는 stdin close 시 falsy 값을 한 번
 * 더 방출할 수 있어 `if (!line) continue;` 가드가 모든 스텁에 필요하다.
 */
function stubCommand(script: string): string[] {
  return ["bun", "-e", script];
}

const echoRankedStub = stubCommand(`
(async () => {
  for await (const line of console) {
    if (!line) continue;
    let req; try { req = JSON.parse(line); } catch { continue; }
    console.log(JSON.stringify({ id: req.id, ranked: ["s1"] }));
  }
})();
`);

describe("runExternalAdapter (RotAdapter.ts)", () => {
  test("정상 요청/응답 round-trip", async () => {
    const requests: RotAdapterRequest[] = [
      { id: "q1", query: "x", top_k: 1, sessions: [{ id: "s1", text: "hello" }] },
      { id: "q2", query: "y", top_k: 1, sessions: [{ id: "s1", text: "hello" }] },
    ];
    const results = await runExternalAdapter(echoRankedStub, requests, { timeoutMs: 5_000 });
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ id: "q1", ranked: ["s1"] });
    expect(results[1]).toEqual({ id: "q2", ranked: ["s1"] });
  });

  test("잘못된 JSON 라인 → 해당 평가는 오류(timeout) 기록, 다음 요청은 정상 처리", async () => {
    // 요청 1건에는 파싱 불가한 쓰레기 줄만 보내고(계속 대기하다 timeout),
    // 요청 2건은 정상 echo — 어댑터 프로세스는 두 요청을 순차로 계속 처리한다.
    const stub = stubCommand(`
(async () => {
  let n = 0;
  for await (const line of console) {
    if (!line) continue;
    let req; try { req = JSON.parse(line); } catch { continue; }
    n++;
    if (n === 1) {
      console.log("not-json-{{{");
      continue;
    }
    console.log(JSON.stringify({ id: req.id, ranked: ["s1"] }));
  }
})();
`);
    const requests: RotAdapterRequest[] = [
      { id: "q1", query: "x", top_k: 1, sessions: [{ id: "s1", text: "hello" }] },
      { id: "q2", query: "y", top_k: 1, sessions: [{ id: "s1", text: "hello" }] },
    ];
    const results = await runExternalAdapter(stub, requests, { timeoutMs: 300 });
    expect(results).toHaveLength(2);
    expect(results[0]!.error).toBe("timeout");
    expect(results[0]!.ranked).toEqual([]);
    expect(results[1]).toEqual({ id: "q2", ranked: ["s1"] });
  });

  test("타임아웃 — 응답 없는 스텁은 error:'timeout' 으로 기록", async () => {
    const neverRespondStub = stubCommand(`
(async () => {
  for await (const line of console) {
    if (!line) continue;
    // 응답하지 않고 계속 대기만 한다
  }
})();
`);
    const requests: RotAdapterRequest[] = [
      { id: "q1", query: "x", top_k: 1, sessions: [{ id: "s1", text: "hello" }] },
    ];
    const results = await runExternalAdapter(neverRespondStub, requests, { timeoutMs: 300 });
    expect(results).toEqual([{ id: "q1", ranked: [], error: "timeout" }]);
  });

  test("ranked 필드가 문자열 배열 아님 → invalid response 오류", async () => {
    const badRankedStub = stubCommand(`
(async () => {
  for await (const line of console) {
    if (!line) continue;
    let req; try { req = JSON.parse(line); } catch { continue; }
    console.log(JSON.stringify({ id: req.id, ranked: [1, 2, 3] }));
  }
})();
`);
    const requests: RotAdapterRequest[] = [
      { id: "q1", query: "x", top_k: 1, sessions: [{ id: "s1", text: "hello" }] },
    ];
    const results = await runExternalAdapter(badRankedStub, requests, { timeoutMs: 5_000 });
    expect(results).toHaveLength(1);
    expect(results[0]!.ranked).toEqual([]);
    expect(results[0]!.error).toContain("invalid response");
  });

  test("EOF (프로세스 조기 종료) → 이후 요청 전부 오류 처리, 크래시 없음", async () => {
    const earlyExitStub = stubCommand(`
(async () => {
  for await (const line of console) {
    if (!line) continue;
    let req; try { req = JSON.parse(line); } catch { continue; }
    console.log(JSON.stringify({ id: req.id, ranked: ["s1"] }));
    break; // 첫 응답 후 프로세스 종료 (stdout EOF)
  }
})();
`);
    const requests: RotAdapterRequest[] = [
      { id: "q1", query: "x", top_k: 1, sessions: [{ id: "s1", text: "hello" }] },
      { id: "q2", query: "y", top_k: 1, sessions: [{ id: "s1", text: "hello" }] },
      { id: "q3", query: "z", top_k: 1, sessions: [{ id: "s1", text: "hello" }] },
    ];
    const results = await runExternalAdapter(earlyExitStub, requests, { timeoutMs: 5_000 });
    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ id: "q1", ranked: ["s1"] });
    expect(results[1]!.ranked).toEqual([]);
    expect(results[1]!.error).toContain("EOF");
    expect(results[2]!.ranked).toEqual([]);
    expect(results[2]!.error).toContain("EOF");
  });

  test("RotBench.ts 의 runRotBenchAsync + externalAdapter 옵션 통합", async () => {
    const embedder = new HashedNgramEmbedder();
    const question: LmeQuestion = {
      question_id: "q1",
      question_type: "single-session-user",
      question: "What degree did I graduate with?",
      haystack_session_ids: ["s1", "s2"],
      haystack_dates: ["2023/01/10 (Tue)", "2023/02/01 (Wed)"],
      haystack_sessions: [
        [{ role: "user", content: "I graduated with a business administration degree." }],
        [{ role: "user", content: "My cat knocked over the coffee mug again." }],
      ],
      answer_session_ids: ["s1"],
    };
    const fixedRankStub = stubCommand(`
(async () => {
  for await (const line of console) {
    if (!line) continue;
    let req; try { req = JSON.parse(line); } catch { continue; }
    console.log(JSON.stringify({ id: req.id, ranked: ["s1", "s2"] }));
  }
})();
`);
    const opts: RotBenchOpts = {
      embedder,
      checkpoints: [1.0],
      externalAdapter: { command: fixedRankStub, label: "fixed-stub", timeoutMs: 5_000 },
    };
    const result = await runRotBenchAsync([question], opts);
    expect(result.conditions).toContain("external");
    expect(result.externalLabel).toBe("fixed-stub");
    expect(result.externalErrorCount).toBe(0);
    const cell = result.aggregates.find((c) => c.condition === "external" && c.checkpoint === 1.0);
    expect(cell).toBeDefined();
    expect(cell!.caseCount).toBe(1);
    expect(cell!.recallAt5).toBe(1);
  });
});
