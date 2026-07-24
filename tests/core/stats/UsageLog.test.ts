import { describe, test, expect, beforeEach } from "bun:test";
import { UsageLog } from "../../../src/core/stats/UsageLog";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";

describe("UsageLog", () => {
  let storage: MemoryStorage;
  let log: UsageLog;

  beforeEach(() => {
    storage = new MemoryStorage();
    log = new UsageLog(storage);
  });

  test("record → 파일에 append 되고 aggregate 집계에 반영된다", async () => {
    await log.record({ tool: "search", query: "라우팅 정책", hits: 3, topPageIds: ["p1", "p2"], ts: new Date().toISOString() });
    await log.record({ tool: "ask", query: "SSL skill", hits: 1, topPageIds: ["p1"], ts: new Date().toISOString() });

    const agg = await log.aggregate();
    expect(agg.totalSearches).toBe(1);
    expect(agg.totalAsks).toBe(1);
    expect(agg.uniqueQueries).toBe(2);
    expect(agg.topPages[0]!.pageId).toBe("p1");
    expect(agg.topPages[0]!.count).toBe(2);
  });

  test("파일 없음 → all-zero 집계", async () => {
    const agg = await log.aggregate();
    expect(agg.totalSearches).toBe(0);
    expect(agg.totalAsks).toBe(0);
    expect(agg.uniqueQueries).toBe(0);
    expect(agg.topQueries).toEqual([]);
    expect(agg.topPages).toEqual([]);
    expect(agg.byDay).toEqual([]);
  });

  test("손상 라인은 skip 하고 크래시하지 않는다", async () => {
    await log.record({ tool: "search", query: "정상 라인", hits: 1, topPageIds: [], ts: new Date().toISOString() });
    const existing = (await storage.readText("stats/usage.jsonl")) ?? "";
    await storage.writeRaw("stats/usage.jsonl", existing + "{ this is not valid json\n" + '{"tool":"search"}\n');

    const agg = await log.aggregate();
    // 손상 라인 + ts 없는 라인은 skip 되고, 정상 라인 1건만 집계된다.
    expect(agg.totalSearches).toBe(1);
  });

  test("days 옵션으로 기간 밖 엔트리는 집계에서 제외된다", async () => {
    const old = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const recent = new Date().toISOString();
    await log.record({ tool: "search", query: "오래된 질의", hits: 1, topPageIds: [], ts: old });
    await log.record({ tool: "search", query: "최근 질의", hits: 1, topPageIds: [], ts: recent });

    const agg = await log.aggregate({ days: 7 });
    expect(agg.totalSearches).toBe(1);
    expect(agg.topQueries.map((q) => q.query)).toEqual(["최근 질의"]);
  });

  test("topQueries / topPages 는 최대 5건, 빈도순 정렬된다", async () => {
    for (let i = 0; i < 7; i++) {
      await log.record({
        tool: "search",
        query: `질의-${i}`,
        hits: 1,
        topPageIds: i < 6 ? ["page-common"] : [],
        ts: new Date().toISOString(),
      });
    }
    // 가장 많이 검색된 질의 하나를 추가로 더 기록
    await log.record({ tool: "search", query: "질의-0", hits: 1, topPageIds: [], ts: new Date().toISOString() });

    const agg = await log.aggregate();
    expect(agg.topQueries.length).toBeLessThanOrEqual(5);
    expect(agg.topQueries[0]!.query).toBe("질의-0");
    expect(agg.topQueries[0]!.count).toBe(2);
    expect(agg.topPages[0]!.pageId).toBe("page-common");
    expect(agg.topPages[0]!.count).toBe(6);
  });

  test("pageStats — 페이지별 회상 횟수 + 마지막 회상 시각을 집계한다", async () => {
    await log.record({ tool: "search", query: "a", hits: 1, topPageIds: ["p1", "p2"], ts: "2026-07-01T00:00:00.000Z" });
    await log.record({ tool: "ask", query: "b", hits: 1, topPageIds: ["p1"], ts: "2026-07-10T00:00:00.000Z" });

    const stats = await log.pageStats();
    const p1 = stats.find((s) => s.pageId === "p1");
    const p2 = stats.find((s) => s.pageId === "p2");
    expect(p1?.count).toBe(2);
    expect(p1?.lastTs).toBe("2026-07-10T00:00:00.000Z");
    expect(p2?.count).toBe(1);
    // 빈도순 정렬
    expect(stats[0]!.pageId).toBe("p1");
  });

  test("contextTokens 없는 구형 라인도 정상 파싱되고 0 취급된다", async () => {
    await log.record({ tool: "search", query: "신형", hits: 1, topPageIds: [], ts: new Date().toISOString(), contextTokens: 120 });
    // 구형 라인(contextTokens 필드 없음)을 직접 append.
    const existing = (await storage.readText("stats/usage.jsonl")) ?? "";
    await storage.writeRaw(
      "stats/usage.jsonl",
      existing + JSON.stringify({ tool: "search", query: "구형", hits: 1, topPageIds: [], ts: new Date().toISOString() }) + "\n",
    );

    const agg = await log.aggregate();
    expect(agg.totalSearches).toBe(2);
    expect(agg.totalContextTokens).toBe(120);
  });

  test("pageStats — days 옵션으로 기간 밖 회상은 제외되고, 기록 없으면 빈 배열", async () => {
    const empty = await log.pageStats();
    expect(empty).toEqual([]);

    const old = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const recent = new Date().toISOString();
    await log.record({ tool: "search", query: "오래됨", hits: 1, topPageIds: ["old-page"], ts: old });
    await log.record({ tool: "search", query: "최근", hits: 1, topPageIds: ["new-page"], ts: recent });

    const stats = await log.pageStats({ days: 7 });
    expect(stats.map((s) => s.pageId)).toEqual(["new-page"]);
  });
});
