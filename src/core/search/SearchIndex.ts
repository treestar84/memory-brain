import { Database } from "bun:sqlite";
import type { WikiPage } from "../wiki/types";
import type { ClaimCandidate } from "../claim/types";
import type { SSLDocument } from "../ontology/ssl";
import type { KGNode, KGEdge } from "./KGProjector";
import type { Embedder } from "./Embedder";
import { blobToVector, cosineSimilarity, vectorToBlob } from "./Embedder";
import type {
  WikiSearchHit,
  ClaimSearchHit,
  WikiSearchOpts,
  ClaimSearchOpts,
  SkillSearchHit,
  SkillSearchOpts,
} from "./types";

const SCHEMA_VERSION = 5;

// v5 마이그레이션 가드가 drop 하는 derived 테이블 (전부 rebuild 로 재생성 가능)
const DERIVED_TABLES = [
  "wiki_pages", "claims", "ssl_skills", "vectors", "wiki_dates", "kg_nodes", "kg_edges",
];

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  // body_user (V3.30): user 발화만 모은 보조 컬럼 — bm25 가중으로 assistant
  // 장문에 의한 신호 희석 보정. 빈 문자열이면 기본 랭킹과 수학적 동치.
  // snippet() 의 body 컬럼 인덱스 4 는 불변 (tags 뒤에 추가).
  `CREATE VIRTUAL TABLE IF NOT EXISTS wiki_pages USING fts5(
    page_id UNINDEXED,
    page_path UNINDEXED,
    type,
    status,
    body,
    tags,
    body_user,
    tokenize='unicode61'
  )`,
  // 세션/문서 날짜 (V3.30) — dateWindow soft filter 용. body 선두 [date: ...] 파싱.
  `CREATE TABLE IF NOT EXISTS wiki_dates (
    page_id   TEXT PRIMARY KEY,
    epoch_day INTEGER NOT NULL
  ) STRICT`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS claims USING fts5(
    candidate_id UNINDEXED,
    proposed_type,
    proposed_text,
    detected_by,
    status,
    tokenize='unicode61'
  )`,
  // SSL skill discovery table (PR-V3.14). 3 ranked text columns map to the
  // paper's Scheduling / Structural / Logical layers; bm25 weights are
  // applied at query time so skill discovery prioritises intent signals.
  `CREATE VIRTUAL TABLE IF NOT EXISTS ssl_skills USING fts5(
    skill_slug UNINDEXED,
    skill_name UNINDEXED,
    source_path UNINDEXED,
    intent_signature UNINDEXED,
    scheduling_text,
    structural_text,
    logical_text,
    tokenize='unicode61'
  )`,
  `CREATE TABLE IF NOT EXISTS kg_nodes (
    node_id    TEXT PRIMARY KEY,
    node_type  TEXT NOT NULL,
    skill_slug TEXT NOT NULL,
    scene      TEXT,
    action     TEXT,
    label      TEXT NOT NULL,
    properties TEXT NOT NULL
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS idx_kg_nodes_skill ON kg_nodes(skill_slug)`,
  `CREATE INDEX IF NOT EXISTS idx_kg_nodes_type  ON kg_nodes(node_type)`,
  `CREATE TABLE IF NOT EXISTS kg_edges (
    from_id    TEXT NOT NULL,
    to_id      TEXT NOT NULL,
    relation   TEXT NOT NULL,
    from_skill TEXT NOT NULL,
    to_skill   TEXT,
    resolved   INTEGER NOT NULL DEFAULT 1,
    properties TEXT,
    PRIMARY KEY (from_id, to_id, relation)
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS idx_kg_edges_to        ON kg_edges(to_id, relation)`,
  `CREATE INDEX IF NOT EXISTS idx_kg_edges_relation  ON kg_edges(relation)`,
  `CREATE INDEX IF NOT EXISTS idx_kg_edges_from_skill ON kg_edges(from_skill)`,
  `CREATE INDEX IF NOT EXISTS idx_kg_edges_to_skill   ON kg_edges(to_skill)`,
  // Hybrid search 벡터 저장 (V3.28, schema v4). derived — rebuild 시 재생성.
  // embedder 미주입 rebuild 에서는 비어 있고 hybrid 는 FTS 결과로 fallback.
  `CREATE TABLE IF NOT EXISTS vectors (
    doc_kind TEXT NOT NULL,
    doc_id   TEXT NOT NULL,
    dims     INTEGER NOT NULL,
    vec      BLOB NOT NULL,
    PRIMARY KEY (doc_kind, doc_id)
  ) STRICT`,
];

// RRF (Reciprocal Rank Fusion) 상수 — 관례값 60. score = Σ 1/(k + rank).
// BM25/cosine 점수 스케일 정규화 문제를 rank 만으로 회피한다.
const RRF_K = 60;
// fusion 후보 폭 — 요청 limit 의 3배(최소 30)를 각 랭커에서 수집.
const HYBRID_CANDIDATE_FLOOR = 30;
// body_user 컬럼 bm25 가중 (V3.30) — SSL_BM25_WEIGHTS 와 동일 계열 기법
const BODY_USER_WEIGHT = 2.0;

// body 선두 "[date: 2023/05/20 ...]" → epoch day (V3.30 wiki_dates 용)
function extractBodyEpochDay(body: string): number | null {
  const m = /^\[date:\s*(\d{4})\/(\d{2})\/(\d{2})/.exec(body);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) ? Math.floor(ms / 86_400_000) : null;
}

// Paper §4.1: rich SSL fields > raw text. Scheduling carries highest weight
// (matches user intent), Structural middle (phase awareness), Logical low
// (concrete action/resource hints). Numbers are weights for bm25(); higher
// weight = larger contribution to the (negative) score.
const SSL_BM25_WEIGHTS = [3.0, 1.5, 1.0] as const;

/**
 * bun:sqlite + FTS5 기반 derived search index (PR-V3.6).
 *
 * markdown source → SQLite virtual table 인덱싱. rebuild 가능한 파생물 —
 * source-of-truth 아님. 깨지면 markdown 에서 재생성.
 *
 * Korean tokenize 는 unicode61 한정 — 한글 분절 정확도는 후속 PR 에서
 * ICU 또는 trigram 으로 확장.
 *
 * `:memory:` 경로 또는 in-memory 인스턴스로 테스트 가능.
 */
export class SearchIndex {
  private readonly db: Database;

  constructor(dbPath: string = ":memory:") {
    this.db = new Database(dbPath, { create: true });
    this.db.run("PRAGMA journal_mode = WAL");
    // 마이그레이션 가드 (V3.30) — FTS5 는 ALTER 불가. 구버전 파일 DB 는
    // derived 테이블 전부 drop 후 재생성 (source-of-truth 는 markdown —
    // rebuild 로 무손실 복원). 가드 없이는 구버전 DB 에 신규 컬럼 INSERT 가
    // 즉시 실패한다.
    this.db.run("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    const existing = this.getMeta("schema_version");
    if (existing !== null && existing !== String(SCHEMA_VERSION)) {
      for (const t of DERIVED_TABLES) this.db.run(`DROP TABLE IF EXISTS ${t}`);
    }
    for (const stmt of SCHEMA_STATEMENTS) {
      this.db.run(stmt);
    }
    this.setMeta("schema_version", String(SCHEMA_VERSION));
  }

  rebuild(opts: {
    wikiPages: WikiPage[];
    claims: ClaimCandidate[];
    skills?: SSLDocument[];
    /** opt-in (V3.28): 주입 시 wiki/skill 벡터를 함께 인덱싱 — hybrid 검색 활성화 */
    embedder?: Embedder;
  }): void {
    const tx = this.db.transaction(() => {
      this.db.run("DELETE FROM wiki_pages");
      this.db.run("DELETE FROM claims");
      this.db.run("DELETE FROM ssl_skills");
      this.db.run("DELETE FROM vectors");

      const wikiInsert = this.db.prepare(
        "INSERT INTO wiki_pages (page_id, page_path, type, status, body, tags, body_user) VALUES (?, ?, ?, ?, ?, ?, ?)",
      );
      const dateInsert = this.db.prepare(
        "INSERT OR REPLACE INTO wiki_dates (page_id, epoch_day) VALUES (?, ?)",
      );
      for (const p of opts.wikiPages) {
        const tags = Array.isArray(p.frontmatter.tags) ? p.frontmatter.tags.join(" ") : "";
        wikiInsert.run(
          p.frontmatter.id,
          p.path,
          p.frontmatter.type,
          p.frontmatter.status,
          p.body,
          tags,
          p.bodyUser ?? "",
        );
        const epochDay = extractBodyEpochDay(p.body);
        if (epochDay !== null) dateInsert.run(p.frontmatter.id, epochDay);
      }

      const claimInsert = this.db.prepare(
        "INSERT INTO claims (candidate_id, proposed_type, proposed_text, detected_by, status) VALUES (?, ?, ?, ?, ?)",
      );
      for (const c of opts.claims) {
        claimInsert.run(
          c.candidateId,
          c.proposedType,
          c.proposedText,
          c.detectedBy,
          c.status,
        );
      }

      const skills = opts.skills ?? [];
      const skillInsert = this.db.prepare(
        "INSERT INTO ssl_skills (skill_slug, skill_name, source_path, intent_signature, scheduling_text, structural_text, logical_text) VALUES (?, ?, ?, ?, ?, ?, ?)",
      );
      for (const s of skills) {
        const flat = flattenSSL(s);
        skillInsert.run(
          flat.slug,
          s.scheduling.skillName,
          s.sourceSkillPath,
          s.scheduling.intentSignature,
          flat.scheduling,
          flat.structural,
          flat.logical,
        );
      }

      if (opts.embedder) {
        // OR REPLACE — 중복 doc id 입력 (외부 데이터셋 등) 방어. last-wins.
        const vecInsert = this.db.prepare(
          "INSERT OR REPLACE INTO vectors (doc_kind, doc_id, dims, vec) VALUES (?, ?, ?, ?)",
        );
        for (const p of opts.wikiPages) {
          const tags = Array.isArray(p.frontmatter.tags) ? p.frontmatter.tags.join(" ") : "";
          // bodyUser 존재 시 벡터는 user 발화만 — assistant 장문 노이즈 제거 (V3.30)
          const text = `${p.frontmatter.type} ${tags} ${p.bodyUser?.length ? p.bodyUser : p.body}`;
          vecInsert.run("wiki", p.frontmatter.id, opts.embedder.dims, vectorToBlob(opts.embedder.embed(text)));
        }
        for (const s of skills) {
          const flat = flattenSSL(s);
          const text = `${s.scheduling.skillName} ${flat.scheduling} ${flat.structural} ${flat.logical}`;
          vecInsert.run("skill", flat.slug, opts.embedder.dims, vectorToBlob(opts.embedder.embed(text)));
        }
      }

      this.setMeta("rebuilt_at", new Date().toISOString());
      this.setMeta("wiki_count", String(opts.wikiPages.length));
      this.setMeta("claim_count", String(opts.claims.length));
      this.setMeta("skill_count", String(skills.length));
      this.setMeta("vector_dims", opts.embedder ? String(opts.embedder.dims) : "0");
    });
    tx();
  }

  searchSkills(query: string, opts: SkillSearchOpts = {}): SkillSearchHit[] {
    const limit = opts.limit ?? 20;
    const [w1, w2, w3] = SSL_BM25_WEIGHTS;
    const ftsQuery = toLooseFtsQuery(query);
    if (!ftsQuery) return [];
    const sql = `
      SELECT skill_slug, skill_name, source_path, intent_signature,
             bm25(ssl_skills, 0, 0, 0, 0, ${w1}, ${w2}, ${w3}) AS score
      FROM ssl_skills
      WHERE ssl_skills MATCH ?
      ORDER BY score
      LIMIT ?
    `;
    const rows = this.db.query(sql).all(ftsQuery, limit) as Array<{
      skill_slug: string;
      skill_name: string;
      source_path: string;
      intent_signature: string;
      score: number;
    }>;
    return rows.map((r) => ({
      skillSlug: r.skill_slug,
      skillName: r.skill_name,
      sourcePath: r.source_path,
      rank: r.score,
      intentSignature: r.intent_signature,
    }));
  }

  /**
   * Hybrid wiki 검색 (V3.28) — FTS5 BM25 랭킹 + 벡터 cosine 랭킹 융합.
   *
   * fusion 전략 (V3.29 LongMemEval 실측으로 결정):
   * - `"rescue"` (기본): FTS 랭킹을 그대로 보존하고, FTS 가 놓친 문서만 벡터
   *   순위로 뒤에 보충. 긴 문서 코퍼스에서 BM25 정밀도를 해치지 않으면서
   *   (LongMemEval R@1 96% 유지) FTS 0건 쿼리 구제 효과는 그대로 가져간다.
   * - `"rrf"`: Reciprocal Rank Fusion 동등 융합. 짧은 문서·오타 다발 코퍼스용.
   *
   * 벡터가 없거나 (embedder 미주입 rebuild) dims 불일치면 FTS 결과 그대로 반환
   * (안전한 fallback — 결과가 나빠지는 경로 없음). 반환 `rank` 는 -fusion score
   * (낮을수록 관련성↑ 규약 유지).
   */
  searchWikiHybrid(
    query: string,
    embedder: Embedder,
    opts: WikiSearchOpts & { fusion?: HybridFusion } = {},
  ): WikiSearchHit[] {
    const limit = opts.limit ?? 20;
    const candidateLimit = Math.max(limit * 3, HYBRID_CANDIDATE_FLOOR);
    const ftsHits = this.searchWiki(query, {
      type: opts.type,
      status: opts.status,
      dateWindow: opts.dateWindow,
      limit: candidateLimit,
    });
    const vecRanking = this.rankByVector("wiki", query, embedder, candidateLimit);
    if (vecRanking.length === 0) return ftsHits.slice(0, limit);

    const fused = fuse(
      opts.fusion ?? "rescue",
      ftsHits.map((h) => h.pageId),
      vecRanking,
    );

    const hits: WikiSearchHit[] = [];
    const byId = new Map(ftsHits.map((h) => [h.pageId, h]));
    for (const { docId, score } of fused) {
      const existing = byId.get(docId);
      if (existing) {
        hits.push({ ...existing, rank: -score });
      } else {
        const meta = this.wikiMetaById(docId);
        if (!meta) continue;
        if (opts.type && meta.type !== opts.type) continue;
        if (opts.status && meta.status !== opts.status) continue;
        hits.push({ ...meta, rank: -score });
      }
      if (hits.length >= limit) break;
    }
    return hits;
  }

  /** Hybrid skill discovery (V3.28) — searchSkills + 벡터 랭킹 융합 (기본 rescue). */
  searchSkillsHybrid(
    query: string,
    embedder: Embedder,
    opts: SkillSearchOpts & { fusion?: HybridFusion } = {},
  ): SkillSearchHit[] {
    const limit = opts.limit ?? 20;
    const candidateLimit = Math.max(limit * 3, HYBRID_CANDIDATE_FLOOR);
    const ftsHits = this.searchSkills(query, { limit: candidateLimit });
    const vecRanking = this.rankByVector("skill", query, embedder, candidateLimit);
    if (vecRanking.length === 0) return ftsHits.slice(0, limit);

    const fused = fuse(
      opts.fusion ?? "rescue",
      ftsHits.map((h) => h.skillSlug),
      vecRanking,
    );

    const hits: SkillSearchHit[] = [];
    const bySlug = new Map(ftsHits.map((h) => [h.skillSlug, h]));
    for (const { docId, score } of fused) {
      const existing = bySlug.get(docId);
      if (existing) {
        hits.push({ ...existing, rank: -score });
      } else {
        const meta = this.skillMetaBySlug(docId);
        if (!meta) continue;
        hits.push({ ...meta, rank: -score });
      }
      if (hits.length >= limit) break;
    }
    return hits;
  }

  /** 저장된 벡터 존재 여부 — hybrid 활성화 진단용. */
  vectorCount(kind?: "wiki" | "skill"): number {
    const row = kind
      ? (this.db.query("SELECT COUNT(*) AS c FROM vectors WHERE doc_kind = ?").get(kind) as { c: number })
      : (this.db.query("SELECT COUNT(*) AS c FROM vectors").get() as { c: number });
    return row.c;
  }

  private rankByVector(
    kind: "wiki" | "skill",
    query: string,
    embedder: Embedder,
    limit: number,
  ): Array<{ docId: string; sim: number }> {
    const rows = this.db
      .query("SELECT doc_id, dims, vec FROM vectors WHERE doc_kind = ?")
      .all(kind) as Array<{ doc_id: string; dims: number; vec: Uint8Array }>;
    if (rows.length === 0) return [];
    const q = embedder.embed(query);
    const scored: Array<{ docId: string; sim: number }> = [];
    for (const r of rows) {
      if (r.dims !== embedder.dims) continue; // 다른 embedder 로 빌드된 인덱스 — 방어
      const sim = cosineSimilarity(q, blobToVector(r.vec));
      if (sim > 0) scored.push({ docId: r.doc_id, sim });
    }
    scored.sort((a, b) => b.sim - a.sim || a.docId.localeCompare(b.docId));
    return scored.slice(0, limit);
  }

  private wikiMetaById(pageId: string): Omit<WikiSearchHit, "rank"> | null {
    const row = this.db
      .query(
        "SELECT page_id, page_path, type, status, substr(body, 1, 120) AS snip FROM wiki_pages WHERE page_id = ?",
      )
      .get(pageId) as
      | { page_id: string; page_path: string; type: string; status: string; snip: string }
      | null;
    if (!row) return null;
    return {
      pageId: row.page_id,
      pagePath: row.page_path,
      type: row.type,
      status: row.status,
      snippet: row.snip,
    };
  }

  private skillMetaBySlug(slug: string): Omit<SkillSearchHit, "rank"> | null {
    const row = this.db
      .query(
        "SELECT skill_slug, skill_name, source_path, intent_signature FROM ssl_skills WHERE skill_slug = ?",
      )
      .get(slug) as
      | { skill_slug: string; skill_name: string; source_path: string; intent_signature: string }
      | null;
    if (!row) return null;
    return {
      skillSlug: row.skill_slug,
      skillName: row.skill_name,
      sourcePath: row.source_path,
      intentSignature: row.intent_signature,
    };
  }

  searchWiki(query: string, opts: WikiSearchOpts = {}): WikiSearchHit[] {
    const limit = opts.limit ?? 20;
    // dateWindow soft filter (V3.30) — 후보를 넓게 뽑아 창 안 문서를 앞으로
    // 승격 (FTS 상대순서 유지, stable partition). hard filter 아님 — 파서
    // 오탐 시에도 기존 랭킹으로 수렴.
    const fetchLimit = opts.dateWindow ? Math.max(limit * 3, HYBRID_CANDIDATE_FLOOR) : limit;
    const filters: string[] = [];
    const params: (string | number)[] = [query];

    if (opts.type) {
      filters.push("type = ?");
      params.push(opts.type);
    }
    if (opts.status) {
      filters.push("status = ?");
      params.push(opts.status);
    }

    const where = filters.length > 0 ? `AND ${filters.join(" AND ")}` : "";
    // bm25 명시 가중 (V3.30): body_user(마지막 컬럼) 3.0 — user 발화 신호 강조.
    // body_user 가 빈 코퍼스에서는 기본 rank 와 수학적 동치 (회귀 테스트로 고정).
    const sql = `
      SELECT page_id, page_path, type, status,
             bm25(wiki_pages, 0, 0, 1.0, 1.0, 1.0, 1.0, ${BODY_USER_WEIGHT}) AS score,
             snippet(wiki_pages, 4, '<<', '>>', '...', 12) AS snip
      FROM wiki_pages
      WHERE wiki_pages MATCH ? ${where}
      ORDER BY score
      LIMIT ?
    `;
    params.push(fetchLimit);
    const rows = this.queryFtsWithFallback(sql, params) as Array<{
      page_id: string;
      page_path: string;
      type: string;
      status: string;
      score: number;
      snip: string;
    }>;
    let hits: WikiSearchHit[] = rows.map((r) => ({
      pageId: r.page_id,
      pagePath: r.page_path,
      type: r.type,
      status: r.status,
      rank: r.score,
      snippet: r.snip,
    }));

    if (opts.dateWindow && hits.length > 0) {
      hits = this.partitionByDateWindow(hits, opts.dateWindow);
    }
    return hits.slice(0, limit);
  }

  /** 창 안 문서 우선 승격 (양쪽 모두 FTS 상대순서 유지 — stable partition). */
  private partitionByDateWindow(
    hits: WikiSearchHit[],
    window: { startEpochDay: number; endEpochDay: number },
  ): WikiSearchHit[] {
    const ids = hits.map((h) => h.pageId);
    const placeholders = ids.map(() => "?").join(",");
    const rows = this.db
      .query(`SELECT page_id, epoch_day FROM wiki_dates WHERE page_id IN (${placeholders})`)
      .all(...ids) as Array<{ page_id: string; epoch_day: number }>;
    const dayOf = new Map(rows.map((r) => [r.page_id, r.epoch_day]));
    const inWindow: WikiSearchHit[] = [];
    const outWindow: WikiSearchHit[] = [];
    for (const h of hits) {
      const d = dayOf.get(h.pageId);
      if (d !== undefined && d >= window.startEpochDay && d <= window.endEpochDay) inWindow.push(h);
      else outWindow.push(h);
    }
    if (inWindow.length === 0) return hits;
    return [...inWindow, ...outWindow];
  }

  searchClaims(query: string, opts: ClaimSearchOpts = {}): ClaimSearchHit[] {
    const limit = opts.limit ?? 20;
    const filters: string[] = [];
    const params: (string | number)[] = [query];

    if (opts.status) {
      filters.push("status = ?");
      params.push(opts.status);
    }

    const where = filters.length > 0 ? `AND ${filters.join(" AND ")}` : "";
    const sql = `
      SELECT candidate_id, proposed_type, proposed_text, status, rank, snippet(claims, 2, '<<', '>>', '...', 12) AS snip
      FROM claims
      WHERE claims MATCH ? ${where}
      ORDER BY rank
      LIMIT ?
    `;
    params.push(limit);
    const rows = this.queryFtsWithFallback(sql, params) as Array<{
      candidate_id: string;
      proposed_type: string;
      proposed_text: string;
      status: string;
      rank: number;
      snip: string;
    }>;
    return rows.map((r) => ({
      candidateId: r.candidate_id,
      proposedType: r.proposed_type,
      proposedText: r.proposed_text,
      status: r.status,
      rank: r.rank,
      snippet: r.snip,
    }));
  }

  replaceKG(nodes: KGNode[], edges: KGEdge[]): void {
    const tx = this.db.transaction(() => {
      this.db.run("DELETE FROM kg_edges");
      this.db.run("DELETE FROM kg_nodes");
      const nodeStmt = this.db.prepare(
        "INSERT OR REPLACE INTO kg_nodes (node_id, node_type, skill_slug, scene, action, label, properties) VALUES (?, ?, ?, ?, ?, ?, ?)",
      );
      for (const n of nodes) {
        nodeStmt.run(n.nodeId, n.nodeType, n.skillSlug, n.scene ?? null, n.action ?? null, n.label, n.properties);
      }
      const edgeStmt = this.db.prepare(
        "INSERT OR REPLACE INTO kg_edges (from_id, to_id, relation, from_skill, to_skill, resolved, properties) VALUES (?, ?, ?, ?, ?, ?, ?)",
      );
      for (const e of edges) {
        edgeStmt.run(e.fromId, e.toId, e.relation, e.fromSkill, e.toSkill ?? null, e.resolved ? 1 : 0, e.properties ?? null);
      }
    });
    tx();
  }

  /**
   * FTS MATCH 3단 fallback (V3.28 방어 → V3.30 content 쿼리 삽입).
   *
   * 1. raw — FTS5 고급 구문 사용자 보존. 구문 오류/0행이면 다음 단계.
   * 2. content — stopword·상대시간 어휘 제거 + 경량 스테밍 OR 쿼리.
   *    자연어 질문에서 기능어("can you some my...")가 전 문서에 매치돼
   *    BM25 변별력을 파괴하던 문제 (LongMemEval 진단 33건 중 ~20건) 해결.
   * 3. loose — 전체 토큰 OR prefix (최후 안전망, 기존 동작).
   */
  private queryFtsWithFallback(sql: string, params: (string | number)[]): unknown[] {
    const raw = String(params[0]);
    const attempts = [raw, toContentFtsQuery(raw), toLooseFtsQuery(raw)];
    const tried = new Set<string>();
    for (const q of attempts) {
      if (!q || tried.has(q)) continue;
      tried.add(q);
      try {
        const rows = this.db.query(sql).all(q, ...params.slice(1));
        if (rows.length > 0) return rows;
      } catch {
        /* FTS5 구문 오류 → 다음 단계 */
      }
    }
    return [];
  }

  getMeta(key: string): string | null {
    const row = this.db
      .query("SELECT value FROM meta WHERE key = ?")
      .get(key) as { value: string } | null;
    return row?.value ?? null;
  }

  private setMeta(key: string, value: string): void {
    this.db
      .prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)")
      .run(key, value);
  }

  close(): void {
    this.db.close();
  }
}

export type HybridFusion = "rescue" | "rrf" | "rescue-rerank";

/**
 * 융합 전략 dispatch (V3.28 rrf → V3.29 rescue 기본 → V3.30 rescue-rerank 추가).
 *
 * rescue: FTS 순위 원형 보존 + 벡터-only 문서를 뒤에 보충. LongMemEval 실측
 * (긴 세션 문서 500문항) 에서 동등 RRF 가 R@1 96%→64% 로 퇴행하는 것을 확인
 * — 벡터는 "FTS 가 못 찾은 것 구제" 역할일 때만 순이득이었다.
 *
 * rescue-rerank: rescue 의 한계 (FTS 기반환 문서의 순위를 절대 못 올림 —
 * rank 4~6 근거가 그대로 고착) 보완. top-3 은 rescue 동일 고정, rank 4+ FTS
 * 꼬리만 FTS×벡터 RRF 로 재정렬. top-3 침범 불가 → R@1/R@3 무퇴행 보장.
 * bench 실측 게이트 통과 전까지 opt-in.
 */
function fuse(
  strategy: HybridFusion,
  ftsIds: string[],
  vecRanking: Array<{ docId: string; sim: number }>,
): Array<{ docId: string; score: number }> {
  if (strategy === "rrf") return fuseRrf(ftsIds, vecRanking);
  if (strategy === "rescue-rerank") return fuseRescueRerank(ftsIds, vecRanking);
  return fuseRescue(ftsIds, vecRanking);
}

const RERANK_PIN = 3;

function fuseRescueRerank(
  ftsIds: string[],
  vecRanking: Array<{ docId: string; sim: number }>,
  pin: number = RERANK_PIN,
): Array<{ docId: string; score: number }> {
  const uniqueFts: string[] = [];
  const seen = new Set<string>();
  for (const id of ftsIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    uniqueFts.push(id);
  }
  const vecRankOf = new Map<string, number>();
  vecRanking.forEach(({ docId }, i) => {
    if (!vecRankOf.has(docId)) vecRankOf.set(docId, i + 1);
  });

  const pinned = uniqueFts.slice(0, pin);
  // FTS 꼬리: FTS rank + 벡터 rank 의 RRF 로 재정렬 (벡터 미포함 문서는 FTS 항만)
  const tail = uniqueFts.slice(pin).map((id, i) => {
    const ftsTerm = 1 / (RRF_K + pin + i + 1);
    const vr = vecRankOf.get(id);
    const vecTerm = vr === undefined ? 0 : 1 / (RRF_K + vr);
    return { docId: id, rrf: ftsTerm + vecTerm };
  });
  tail.sort((a, b) => b.rrf - a.rrf || a.docId.localeCompare(b.docId));

  const vectorOnly = vecRanking.filter(({ docId }) => !seen.has(docId));

  // 최종 순서대로 단조 감소 score 재부여 — pinned 가 항상 최상위 (clamp 불변식)
  const ordered = [
    ...pinned,
    ...tail.map((t) => t.docId),
    ...vectorOnly.map((v) => v.docId),
  ];
  return ordered.map((docId, pos) => ({ docId, score: 1 / (RRF_K + pos + 1) }));
}

function fuseRescue(
  ftsIds: string[],
  vecRanking: Array<{ docId: string; sim: number }>,
): Array<{ docId: string; score: number }> {
  const out: Array<{ docId: string; score: number }> = [];
  const seen = new Set<string>();
  ftsIds.forEach((id, i) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ docId: id, score: 1 / (RRF_K + i + 1) });
  });
  // FTS 미포함 문서만 벡터 순위로 보충 — FTS 꼬리 score 보다 항상 낮게
  const tailBase = RRF_K + ftsIds.length + 1;
  vecRanking.forEach(({ docId }, i) => {
    if (seen.has(docId)) return;
    seen.add(docId);
    out.push({ docId, score: 1 / (tailBase + i + 1) });
  });
  return out;
}

/**
 * Reciprocal Rank Fusion — 두 랭킹 리스트 동등 융합 (V3.28).
 * ftsIds: FTS 순위 순 문서 id. vecRanking: cosine 내림차순.
 * 반환: RRF score 내림차순 (동점 시 docId 사전순 — 결정론 보장).
 */
function fuseRrf(
  ftsIds: string[],
  vecRanking: Array<{ docId: string; sim: number }>,
): Array<{ docId: string; score: number }> {
  const scores = new Map<string, number>();
  ftsIds.forEach((id, i) => {
    scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + i + 1));
  });
  vecRanking.forEach(({ docId }, i) => {
    scores.set(docId, (scores.get(docId) ?? 0) + 1 / (RRF_K + i + 1));
  });
  return Array.from(scores.entries())
    .map(([docId, score]) => ({ docId, score }))
    .sort((a, b) => b.score - a.score || a.docId.localeCompare(b.docId));
}

// 영어 기능어 + 대명사 + 조동사 (V3.30 content 쿼리용). 도메인 특화 상수 금지
// 원칙 — 일반 영어 stopword 만. 한국어는 조사 분리가 안 되는 unicode61 특성상
// 토큰 자체가 내용어를 포함하므로 리스트에 넣지 않는다.
const FTS_STOPWORDS = new Set([
  "a", "an", "the", "i", "me", "my", "mine", "we", "our", "ours", "you", "your",
  "yours", "he", "him", "his", "she", "her", "hers", "it", "its", "they", "them",
  "their", "theirs", "this", "that", "these", "those", "what", "which", "who",
  "whom", "whose", "when", "where", "why", "how", "am", "is", "are", "was",
  "were", "be", "been", "being", "have", "has", "had", "having", "do", "does",
  "did", "doing", "will", "would", "shall", "should", "can", "could", "may",
  "might", "must", "and", "or", "but", "if", "then", "else", "so", "than",
  "too", "very", "just", "about", "into", "over", "under", "again", "further",
  "once", "here", "there", "all", "any", "both", "each", "few", "more", "most",
  "other", "some", "such", "no", "nor", "not", "only", "own", "same", "of",
  "at", "by", "for", "with", "to", "from", "in", "on", "off", "out", "up",
  "down", "as", "also", "please",
]);
// 주의: like/want/need/prefer 류 일반동사는 선호(preference) 질문의 내용어라
// 제거하지 않는다 — P1 실측에서 preference MRR 0.630→0.563 퇴행으로 확인.

// 상대시간 어휘 — 어휘 매칭 신호로는 distractor 를 올리는 노이즈 (진단 패턴 1).
// 날짜 창 신호로는 TemporalQuery 가 별도 처리한다.
const RELATIVE_TIME_WORDS = new Set([
  "ago", "last", "past", "day", "days", "week", "weeks", "month", "months",
  "year", "years", "yesterday", "today", "tonight", "recently", "earlier",
  "recent", "currently", "now", "latest", "ever",
]);

// 경량 결정론 스테밍 — 말미 접미사 제거형이 3자 이상이면 OR 병기 후보
function stemOf(token: string): string | null {
  for (const suffix of ["ing", "ed", "es", "s"]) {
    if (token.endsWith(suffix)) {
      const stem = token.slice(0, -suffix.length);
      if (stem.length >= 3) return stem;
      return null;
    }
  }
  return null;
}

// 한글 음절/자모는 유니코드 \p{L}(letter) 범주라 "SessionConsolidator를" 처럼
// 로마자 뒤에 조사가 공백 없이 붙으면 하나의 토큰으로 묶여 FTS 매칭이 깨진다
// (SQLite FTS5 unicode61 자체도 동일 — 실측 확인, V3.41). 이미 고쳤던 FTS5
// 하이픈 크래시와 같은 계열의 문제. 로마자/숫자 ↔ 한글 경계에 공백을 끼워
// 넣어 조사를 분리한다 — 짧은 조사 토큰(를/가/은/는 등)은 기존 길이 필터가
// 자연히 걸러낸다.
const HANGUL_CHARS = "\\uac00-\\ud7a3\\u1100-\\u11ff\\u3130-\\u318f";
const LATIN_HANGUL_BOUNDARY_RE = new RegExp(`([a-z0-9])([${HANGUL_CHARS}])`, "gu");
const HANGUL_LATIN_BOUNDARY_RE = new RegExp(`([${HANGUL_CHARS}])([a-z0-9])`, "gu");

function splitScriptBoundary(text: string): string {
  return text.replace(LATIN_HANGUL_BOUNDARY_RE, "$1 $2").replace(HANGUL_LATIN_BOUNDARY_RE, "$1 $2");
}

/**
 * Content-token FTS 쿼리 (V3.30) — stopword·상대시간 어휘 제거 + 경량 스테밍.
 * content 토큰이 0개면 빈 문자열 반환 (호출측이 loose 로 fallback).
 */
export function toContentFtsQuery(raw: string): string {
  const tokens = splitScriptBoundary(raw.toLowerCase())
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0);
  const content = tokens.filter(
    (t) =>
      !FTS_STOPWORDS.has(t) &&
      !RELATIVE_TIME_WORDS.has(t) &&
      !(t.length <= 2 && !/\d/.test(t)),
  );
  if (content.length === 0) return "";
  const parts = content.map((t) => {
    const stem = stemOf(t);
    return stem && stem !== t ? `(${t}* OR ${stem}*)` : `${t}*`;
  });
  return Array.from(new Set(parts)).join(" OR ");
}

// FTS5 unicode61 doesn't stem — wrap each user token in a prefix-match `*`
// and OR them together so 'failure' matches 'failures', 'doc' matches
// 'documentation', etc. Skill discovery must be morphology-tolerant.
function toLooseFtsQuery(raw: string): string {
  const tokens = splitScriptBoundary(raw.toLowerCase())
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return "";
  return tokens.map((t) => `${t}*`).join(" OR ");
}

function flattenSSL(doc: SSLDocument): {
  slug: string;
  scheduling: string;
  structural: string;
  logical: string;
} {
  const rawId = doc.scheduling.id;
  const slug = rawId && rawId.includes("#")
    ? rawId.split("#")[0]
    : doc.scheduling.skillName.toLowerCase().replace(/\s+/g, "-");
  const scheduling = [
    doc.scheduling.skillName,
    doc.scheduling.intentSignature,
    ...doc.scheduling.triggerPatterns,
    ...doc.scheduling.preconditions,
    doc.scheduling.ioContract.inputsRaw,
    doc.scheduling.ioContract.outputsRaw,
  ].filter(Boolean).join(" ");
  const structural = doc.structural
    .map((s) => `${s.scene} ${s.summary}`)
    .join(" ");
  const logical = doc.logical
    .map((l) => `${l.action} ${l.resources.join(" ")} ${l.description ?? ""}`)
    .join(" ");
  return { slug, scheduling, structural, logical };
}
