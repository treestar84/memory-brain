import type { WikiReader } from "../wiki/WikiReader";
import type { ClaimStore } from "../claim/ClaimStore";
import type { SearchIndex } from "./SearchIndex";
import type { SSLReader } from "./SSLReader";
import type { Embedder } from "./Embedder";
import type { RebuildResult } from "./types";
import { KGProjector } from "./KGProjector";

const WIKI_SUBDIRS = ["projects", "concepts", "decisions"];

// `_ssl/` is a derived artifact directory — exclude from wiki scan so
// SSL JSON skeletons don't leak into wiki_pages as malformed pages.
const WIKI_SUBDIR_EXCLUDE_PREFIX = "_";

/**
 * Search index rebuild orchestrator (PR-V3.6, extended PR-V3.14).
 *
 * markdown source (WikiReader) + claim ledger (ClaimStore) + SSL skill
 * documents (SSLReader, optional) → SearchIndex. 명시 호출 (CLI 또는
 * 후속 자동 트리거) — 자동 갱신은 후속 PR.
 */
export class Indexer {
  constructor(
    private readonly wikiReader: WikiReader,
    private readonly claimStore: ClaimStore,
    private readonly searchIndex: SearchIndex,
    private readonly sslReader?: SSLReader,
    /** opt-in (V3.28): 주입 시 hybrid 검색용 벡터를 함께 인덱싱 */
    private readonly embedder?: Embedder,
  ) {}

  async rebuild(): Promise<RebuildResult> {
    const start = performance.now();

    const wikiPages = [];
    for (const dir of WIKI_SUBDIRS) {
      const pages = await this.wikiReader.readAllInDir(dir);
      for (const p of pages) {
        if (p.path.split("/").some((seg) => seg.startsWith(WIKI_SUBDIR_EXCLUDE_PREFIX))) continue;
        wikiPages.push(p);
      }
    }

    const claims = await this.claimStore.list();

    const sslResult = this.sslReader ? await this.sslReader.readAll() : { docs: [], errors: [] };

    this.searchIndex.rebuild({ wikiPages, claims, skills: sslResult.docs, embedder: this.embedder });

    const { nodes, edges, danglingCount } = new KGProjector().projectAll(sslResult.docs);
    this.searchIndex.replaceKG(nodes, edges);

    const durationMs = Math.round(performance.now() - start);
    return {
      wikiCount: wikiPages.length,
      claimCount: claims.length,
      skillCount: sslResult.docs.length,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      danglingEdgeCount: danglingCount,
      durationMs,
    };
  }
}
