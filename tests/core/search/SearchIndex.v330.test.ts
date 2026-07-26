import { describe, test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SearchIndex, toContentFtsQuery } from "../../../src/core/search/SearchIndex";
import { HashedNgramEmbedder } from "../../../src/core/search/Embedder";
import {
  parseTemporalWindow,
  parseDateToEpochDay,
  hasTemporalIntent,
} from "../../../src/core/search/TemporalQuery";
import type { WikiPage } from "../../../src/core/wiki/types";

const embedder = new HashedNgramEmbedder();

function page(id: string, body: string, bodyUser?: string): WikiPage {
  return {
    path: `concepts/${id}.md`,
    frontmatter: { id, type: "concept", status: "active", updated_at: "2026-07-22" },
    body,
    bodyUser,
    claimIds: [],
    evidence: [],
  };
}

describe("toContentFtsQuery (V3.30 P1)", () => {
  test("stopword·상대시간 어휘 제거 + 내용어 유지", () => {
    const q = toContentFtsQuery("Can you suggest some accessories for my photography setup?");
    expect(q).not.toContain("can*");
    expect(q).not.toContain("some*");
    expect(q).not.toContain("my*");
    expect(q).toContain("photography*");
    expect(q).toContain("setup*");
  });

  test("경량 스테밍 — 복수형에 어간 OR 병기", () => {
    const q = toContentFtsQuery("three trips ordered");
    expect(q).toContain("(trips* OR trip*)");
    expect(q).toContain("(ordered* OR order*)");
    expect(q).not.toContain("(three*"); // 숫자어는 스테밍 변형 없이 그대로
  });

  test("상대시간 어휘 제거 — ago/last/weeks", () => {
    const q = toContentFtsQuery("what did I buy two weeks ago");
    expect(q).not.toContain("ago*");
    expect(q).not.toContain("weeks*");
    expect(q).toContain("buy*");
  });

  test("전부 기능어면 빈 문자열 (loose fallback 신호)", () => {
    expect(toContentFtsQuery("can you tell me about it")).not.toContain("can*");
    expect(toContentFtsQuery("the of and")).toBe("");
  });

  test("preference 내용어 보존 — like/want/need 는 제거하지 않음", () => {
    const q = toContentFtsQuery("what music do I like");
    expect(q).toContain("like*");
    expect(q).toContain("music*");
  });
});

describe("toContentFtsQuery — 한글 조사가 로마자에 붙은 경우 (V3.41)", () => {
  test("영문 용어 뒤에 조사(를)가 공백 없이 붙어도 용어가 독립 토큰으로 분리된다", () => {
    const q = toContentFtsQuery("SessionConsolidator를 왜 폐기했지");
    expect(q).toContain("sessionconsolidator*");
    expect(q).not.toContain("sessionconsolidator를");
  });

  test("여러 조사 패턴(가/는/에서) 전부 분리된다", () => {
    expect(toContentFtsQuery("RotAdapter가 멈췄다")).toContain("rotadapter*");
    expect(toContentFtsQuery("WikiReader는 무엇을 읽나")).toContain("wikireader*");
    expect(toContentFtsQuery("SessionStart에서 실행된다")).toContain("sessionstart*");
  });

  test("이미 공백으로 분리된 경우(기존 동작)는 그대로 유지", () => {
    const q = toContentFtsQuery("SessionConsolidator 폐기 이유");
    expect(q).toContain("sessionconsolidator*");
  });
});

describe("TemporalQuery (V3.30 P3-a)", () => {
  const REF = "2023/06/01 (Thu) 12:00"; // epoch day 기준 목요일

  test("parseDateToEpochDay — 유효/무효", () => {
    expect(parseDateToEpochDay("2023/06/01 (Thu) 12:00")).toBe(
      Math.floor(Date.UTC(2023, 5, 1) / 86_400_000),
    );
    expect(parseDateToEpochDay("no date here")).toBeNull();
  });

  test("'N weeks ago' — 시점 ± pad 창", () => {
    const w = parseTemporalWindow("What did I buy two weeks ago?", REF)!;
    const ref = parseDateToEpochDay(REF)!;
    expect(w.startEpochDay).toBe(ref - 14 - 3);
    expect(w.endEpochDay).toBe(ref - 14 + 3);
  });

  test("'past three months' — [ref-90, ref]", () => {
    const w = parseTemporalWindow("the three trips I took in the past three months", REF)!;
    const ref = parseDateToEpochDay(REF)!;
    expect(w.startEpochDay).toBe(ref - 90);
    expect(w.endEpochDay).toBe(ref);
  });

  test("'last Saturday' — 직전 토요일 ± 1 (규칙 고정)", () => {
    // 2023-06-01 은 목요일 → 직전 토요일 = 2023-05-27 (5일 전)
    const w = parseTemporalWindow("Where did I eat last Saturday?", REF)!;
    const ref = parseDateToEpochDay(REF)!;
    expect(w.startEpochDay).toBe(ref - 5 - 1);
    expect(w.endEpochDay).toBe(ref - 5 + 1);
  });

  test("'last name' 오탐 차단 + 'yesterday'", () => {
    expect(parseTemporalWindow("What is my last name?", REF)).toBeNull();
    const y = parseTemporalWindow("What did I do yesterday?", REF)!;
    const ref = parseDateToEpochDay(REF)!;
    expect(y.endEpochDay).toBe(ref);
    expect(y.startEpochDay).toBe(ref - 2);
  });

  test("hasTemporalIntent — 패턴 유/무", () => {
    expect(hasTemporalIntent("what happened last week")).toBe(true);
    expect(hasTemporalIntent("what is my favorite color")).toBe(false);
  });

  test("기준일 파싱 불가 → null", () => {
    expect(parseTemporalWindow("two weeks ago", "invalid")).toBeNull();
  });
});

describe("SearchIndex v5 (V3.30 P2/P3-b/P4)", () => {
  test("마이그레이션 가드 — 구버전 파일 DB drop & recreate", () => {
    const dir = mkdtempSync(join(tmpdir(), "cfgm-v5-"));
    const dbPath = join(dir, "search.sqlite");
    // 구버전 (v4 형태) DB 시뮬레이션: body_user 없는 wiki_pages + meta v4
    const old = new Database(dbPath, { create: true });
    old.run("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    old.run("INSERT INTO meta (key, value) VALUES ('schema_version', '4')");
    old.run("CREATE VIRTUAL TABLE wiki_pages USING fts5(page_id UNINDEXED, page_path UNINDEXED, type, status, body, tags, tokenize='unicode61')");
    old.close();

    const idx = new SearchIndex(dbPath);
    expect(idx.getMeta("schema_version")).toBe("5");
    idx.rebuild({ wikiPages: [page("concept.a", "hello routing world")], claims: [] });
    expect(idx.searchWiki("routing").length).toBe(1);
    idx.close();
  });

  test("dateWindow soft filter — 창 안 문서 승격, 상대순서 유지", () => {
    const idx = new SearchIndex(":memory:");
    idx.rebuild({
      wikiPages: [
        page("s-old", "[date: 2023/02/15 (Wed) 10:00]\nuser: went on a camping trip"),
        page("s-in1", "[date: 2023/05/10 (Wed) 10:00]\nuser: another camping trip note"),
        page("s-in2", "[date: 2023/05/20 (Sat) 10:00]\nuser: camping trip photos"),
      ],
      claims: [],
    });
    const start = parseDateToEpochDay("2023/05/01")!;
    const end = parseDateToEpochDay("2023/05/31")!;
    const hits = idx.searchWiki("camping trip", { dateWindow: { startEpochDay: start, endEpochDay: end } });
    expect(hits.length).toBe(3);
    expect(hits.slice(0, 2).map((h) => h.pageId).sort()).toEqual(["s-in1", "s-in2"]);
    expect(hits[2]!.pageId).toBe("s-old");
    idx.close();
  });

  test("dateWindow — 창 안 0건이면 기존 랭킹 그대로 (수렴 보장)", () => {
    const idx = new SearchIndex(":memory:");
    idx.rebuild({ wikiPages: [page("s1", "[date: 2023/02/15 (Wed)]\nuser: camping")], claims: [] });
    const hits = idx.searchWiki("camping", {
      dateWindow: { startEpochDay: 99999, endEpochDay: 99999 },
    });
    expect(hits.map((h) => h.pageId)).toEqual(["s1"]);
    idx.close();
  });

  test("bodyUser 가중 — 짧은 user 언급이 장문 assistant distractor 를 이김", () => {
    const idx = new SearchIndex(":memory:");
    // 현실적 distractor: assistant 장문 속에 타깃 어휘가 소수 등장
    const filler = Array.from({ length: 30 }, (_, i) => `assistant: paragraph ${i} about photography lighting technique and composition detail`).join("\n");
    const noise = `assistant: camera flash options include many brands\n${filler}\nassistant: camera flash reviews follow`;
    idx.rebuild({
      wikiPages: [
        page("distractor", noise, ""),
        page("evidence", "user: I upgraded my camera flash\nassistant: great", "I upgraded my camera flash"),
      ],
      claims: [],
    });
    const hits = idx.searchWiki("camera flash");
    expect(hits[0]!.pageId).toBe("evidence");
    idx.close();
  });

  test("bodyUser 미지정 — 기존 랭킹과 동일 (back-compat 동치성)", () => {
    const build = (withEmpty: boolean) => {
      const idx = new SearchIndex(":memory:");
      const pages = [
        page("a", "routing policy lane selection detail text"),
        page("b", "routing mentioned once in passing"),
      ].map((p) => (withEmpty ? { ...p, bodyUser: undefined } : p));
      idx.rebuild({ wikiPages: pages, claims: [] });
      const out = idx.searchWiki("routing policy").map((h) => h.pageId);
      idx.close();
      return out;
    };
    expect(build(true)).toEqual(build(false));
  });

  test("rescue-rerank — top-3 고정 불변식 + rank 4+ 벡터 재정렬", () => {
    const idx = new SearchIndex(":memory:");
    const mk = (id: string, body: string) => page(id, body);
    // 5개 문서가 전부 "shared" 토큰을 공유 (FTS 전원 매치) — d5 만 쿼리와 벡터 유사
    idx.rebuild({
      wikiPages: [
        mk("d1", "shared alpha alpha alpha alpha alpha"),
        mk("d2", "shared beta beta beta beta beta"),
        mk("d3", "shared gamma gamma gamma gamma"),
        mk("d4", "shared delta delta delta delta"),
        mk("d5", "shared upgraded camera flash accessory"),
      ],
      claims: [],
      embedder,
    });
    const rescue = idx.searchWikiHybrid("shared camera flash", embedder, { fusion: "rescue", limit: 5 });
    const rerank = idx.searchWikiHybrid("shared camera flash", embedder, { fusion: "rescue-rerank", limit: 5 });
    // 불변식: 두 전략의 top-3 집합에서 FTS top-3 는 동일 순서
    expect(rerank.slice(0, 3).map((h) => h.pageId)).toEqual(rescue.slice(0, 3).map((h) => h.pageId));
    // d5 가 FTS rank 4+ 라면 rerank 에서 rescue 보다 뒤지지 않아야 함
    const rankOf = (hits: typeof rerank, id: string) => hits.findIndex((h) => h.pageId === id);
    if (rankOf(rescue, "d5") >= 3) {
      expect(rankOf(rerank, "d5")).toBeLessThanOrEqual(rankOf(rescue, "d5"));
    }
    idx.close();
  });
});
