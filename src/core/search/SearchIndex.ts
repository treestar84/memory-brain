import { Database } from "bun:sqlite";
import type { WikiPage } from "../wiki/types";
import type { ClaimCandidate } from "../claim/types";
import type { SSLDocument } from "../ontology/ssl";
import type { KGNode, KGEdge } from "./KGProjector";
import type {
  WikiSearchHit,
  ClaimSearchHit,
  WikiSearchOpts,
  ClaimSearchOpts,
  SkillSearchHit,
  SkillSearchOpts,
} from "./types";

const SCHEMA_VERSION = 3;

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
];

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
    for (const stmt of SCHEMA_STATEMENTS) {
      this.db.run(stmt);
    }
    this.setMeta("schema_version", String(SCHEMA_VERSION));
  }

  rebuild(opts: { wikiPages: WikiPage[]; claims: ClaimCandidate[]; skills?: SSLDocument[] }): void {
    const tx = this.db.transaction(() => {
      this.db.run("DELETE FROM wiki_pages");
      this.db.run("DELETE FROM claims");
      this.db.run("DELETE FROM ssl_skills");

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

      this.setMeta("rebuilt_at", new Date().toISOString());
      this.setMeta("wiki_count", String(opts.wikiPages.length));
      this.setMeta("claim_count", String(opts.claims.length));
      this.setMeta("skill_count", String(skills.length));
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

// FTS5 unicode61 doesn't stem — wrap each user token in a prefix-match `*`
// and OR them together so 'failure' matches 'failures', 'doc' matches
// 'documentation', etc. Skill discovery must be morphology-tolerant.
function toLooseFtsQuery(raw: string): string {
  const tokens = raw
    .toLowerCase()
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
    .map((l) => `${l.action} ${l.resources.join(" ")} ${l.description}`)
    .join(" ");
  return { slug, scheduling, structural, logical };
}
