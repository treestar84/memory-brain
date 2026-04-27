import { Database } from "bun:sqlite";
import type { WikiPage } from "../wiki/types";
import type { ClaimCandidate } from "../claim/types";
import type {
  WikiSearchHit,
  ClaimSearchHit,
  WikiSearchOpts,
  ClaimSearchOpts,
} from "./types";

const SCHEMA_VERSION = 1;

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS wiki_pages USING fts5(
    page_id UNINDEXED,
    page_path UNINDEXED,
    type,
    status,
    body,
    tags,
    tokenize='unicode61'
  )`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS claims USING fts5(
    candidate_id UNINDEXED,
    proposed_type,
    proposed_text,
    detected_by,
    status,
    tokenize='unicode61'
  )`,
];

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
    for (const stmt of SCHEMA_STATEMENTS) {
      this.db.run(stmt);
    }
    this.setMeta("schema_version", String(SCHEMA_VERSION));
  }

  rebuild(opts: { wikiPages: WikiPage[]; claims: ClaimCandidate[] }): void {
    const tx = this.db.transaction(() => {
      this.db.run("DELETE FROM wiki_pages");
      this.db.run("DELETE FROM claims");

      const wikiInsert = this.db.prepare(
        "INSERT INTO wiki_pages (page_id, page_path, type, status, body, tags) VALUES (?, ?, ?, ?, ?, ?)",
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
        );
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

      this.setMeta("rebuilt_at", new Date().toISOString());
      this.setMeta("wiki_count", String(opts.wikiPages.length));
      this.setMeta("claim_count", String(opts.claims.length));
    });
    tx();
  }

  searchWiki(query: string, opts: WikiSearchOpts = {}): WikiSearchHit[] {
    const limit = opts.limit ?? 20;
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
    const sql = `
      SELECT page_id, page_path, type, status, rank, snippet(wiki_pages, 4, '<<', '>>', '...', 12) AS snip
      FROM wiki_pages
      WHERE wiki_pages MATCH ? ${where}
      ORDER BY rank
      LIMIT ?
    `;
    params.push(limit);
    const rows = this.db.query(sql).all(...params) as Array<{
      page_id: string;
      page_path: string;
      type: string;
      status: string;
      rank: number;
      snip: string;
    }>;
    return rows.map((r) => ({
      pageId: r.page_id,
      pagePath: r.page_path,
      type: r.type,
      status: r.status,
      rank: r.rank,
      snippet: r.snip,
    }));
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
    const rows = this.db.query(sql).all(...params) as Array<{
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
