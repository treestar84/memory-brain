import type { WikiReader } from "../wiki/WikiReader";
import type { ClaimStore } from "../claim/ClaimStore";
import type { SearchIndex } from "./SearchIndex";
import type { RebuildResult } from "./types";

const WIKI_SUBDIRS = ["projects", "concepts", "decisions"];

/**
 * Search index rebuild orchestrator (PR-V3.6).
 *
 * markdown source (WikiReader) + claim ledger (ClaimStore) → SearchIndex.
 * 명시 호출 (CLI 또는 후속 자동 트리거) — 자동 갱신은 후속 PR.
 */
export class Indexer {
  constructor(
    private readonly wikiReader: WikiReader,
    private readonly claimStore: ClaimStore,
    private readonly searchIndex: SearchIndex,
  ) {}

  async rebuild(): Promise<RebuildResult> {
    const start = performance.now();

    const wikiPages = [];
    for (const dir of WIKI_SUBDIRS) {
      const pages = await this.wikiReader.readAllInDir(dir);
      wikiPages.push(...pages);
    }

    const claims = await this.claimStore.list();

    this.searchIndex.rebuild({ wikiPages, claims });

    const durationMs = Math.round(performance.now() - start);
    return {
      wikiCount: wikiPages.length,
      claimCount: claims.length,
      durationMs,
    };
  }
}
