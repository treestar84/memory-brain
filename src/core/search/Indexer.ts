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

// V3.41: frontmatter 없는 원문(운영 일지, 벤치마크 리포트)도 검색 대상에 넣는다.
// WIKI_SUBDIRS 와 분리해두는 이유는 decay/OKF export 등 canonical wiki 전용
// 파이프라인이 이 파일들을 절대 건드리지 않게 하기 위함 — WikiReader 가
// type: "note" 로 합성하므로 governance 로직 쪽에서 자연히 걸러진다.
const NOTE_ROOT_FILES = ["current.md"];
const NOTE_DIRS = ["journal", "reports"];

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

    for (const file of NOTE_ROOT_FILES) {
      wikiPages.push(...(await this.wikiReader.readNoteChunks(file)));
    }
    for (const dir of NOTE_DIRS) {
      wikiPages.push(...(await this.wikiReader.readAllInDirAsNoteChunks(dir)));
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
