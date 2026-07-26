#!/usr/bin/env bun
/**
 * rot-bench 외부 어댑터 참조 구현 (docs/ROT-BENCH.md §Adapter protocol 시연용).
 *
 * 프로토콜: stdin 에서 JSONL 요청을 한 줄씩 읽고, 같은 id 를 담은 JSONL
 * 응답을 stdout 에 한 줄씩 즉시 flush 한다.
 *   요청: {"id","query","top_k","sessions":[{"id","date","text"}]}
 *   응답: {"id","ranked":[sessionId, ...]}  (top_k 개 이하)
 *
 * 랭킹 스코어는 query 와 세션 text 사이 단어 겹침 개수(매우 단순한 근사
 * BM25 류) — 최적화 목표가 아니라 프로토콜 왕복을 보여주기 위한 예시다.
 *
 * 실행: bun examples/rot-adapter-bm25.ts
 * rot-bench 연결: cfgm rot-bench -- --adapter "bun examples/rot-adapter-bm25.ts" --adapter-label bm25-example
 */

interface AdapterSessionInput {
  id: string;
  date?: string;
  text: string;
}

interface AdapterRequest {
  id: string;
  query: string;
  top_k: number;
  sessions: AdapterSessionInput[];
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9가-힣]+/g) ?? [];
}

function scoreSession(queryTokens: string[], sessionText: string): number {
  const sessionTokens = new Set(tokenize(sessionText));
  let overlap = 0;
  for (const t of queryTokens) if (sessionTokens.has(t)) overlap++;
  return overlap;
}

function rankSessions(req: AdapterRequest): string[] {
  const queryTokens = tokenize(req.query);
  return req.sessions
    .map((s) => ({ id: s.id, score: scoreSession(queryTokens, s.text) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, req.top_k)
    .map((s) => s.id);
}

export {};

for await (const line of console) {
  const trimmed = line.trim();
  if (trimmed.length === 0) continue;
  let req: AdapterRequest;
  try {
    req = JSON.parse(trimmed) as AdapterRequest;
  } catch {
    continue; // 잘못된 JSON 은 무시 — 호출측이 timeout 으로 오류 처리한다
  }
  const ranked = rankSessions(req);
  process.stdout.write(`${JSON.stringify({ id: req.id, ranked })}\n`);
}
