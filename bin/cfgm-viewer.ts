#!/usr/bin/env bun
import index from "./cfgm-viewer.html";
import { existsSync } from "node:fs";
import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { FlowGraphStore } from "../src/core/flow/FlowGraphStore";
import { FlowGraphProjector } from "../src/core/flow/FlowGraphProjector";
import { ActiveProblemStore } from "../src/core/binder/ActiveProblemStore";
import { resolve } from "node:path";
import { resolveStorageRoot, resolveRepoRoot } from "../src/hooks/bootstrap";
import { UsageLog } from "../src/core/stats/UsageLog";
import { estimateMemoryCorpusTokens } from "../src/core/stats/TokenEstimate";
import { WikiReader } from "../src/core/wiki/WikiReader";
import { SearchIndex } from "../src/core/search/SearchIndex";
import { HashedNgramEmbedder } from "../src/core/search/Embedder";
import { summarizeCaptureQueue } from "../src/core/capture/CaptureStatus";

const STORAGE_ROOT = resolveStorageRoot();
const PORT = Number(process.env.CFGM_VIEWER_PORT ?? 4040);

const storage = new FsStorage(STORAGE_ROOT);
const clock = new RealClock();
const problemStore = new ActiveProblemStore(storage, clock);
const flowStore = new FlowGraphStore(storage, clock);
const projector = new FlowGraphProjector();
const usageLog = new UsageLog(storage);
const memoryDir = resolve(resolveRepoRoot(), "memory");
const indexPath = resolve(STORAGE_ROOT, "indexes", "search.sqlite");

function json(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init?.headers ?? {}) },
  });
}

const server = Bun.serve({
  port: PORT,
  development: { hmr: true, console: true },
  routes: {
    "/": index,

    "/api/problems": async () => {
      const all = await problemStore.listAll();
      const active = await problemStore.getActive();
      return json({ active: active?.id ?? null, problems: all });
    },

    "/api/stats": async (req) => {
      const url = new URL(req.url);
      const daysParam = Number.parseInt(url.searchParams.get("days") ?? "", 10);
      const days = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : 7;
      const agg = await usageLog.aggregate({ days });
      const repoRoot = resolveRepoRoot();
      const memoryDir = resolve(repoRoot, "memory");
      const corpusTokens = await estimateMemoryCorpusTokens(memoryDir);
      const callCount = agg.totalSearches + agg.totalAsks;
      const savingsPct =
        corpusTokens > 0 && callCount > 0
          ? Math.round((1 - agg.totalContextTokens / (callCount * corpusTokens)) * 1000) / 10
          : null;
      return json({
        days,
        ...agg,
        tokens: { context: agg.totalContextTokens, corpus: corpusTokens, savingsPct },
      });
    },

    "/api/problems/:id/graph": async (req) => {
      const id = req.params.id;
      const deltas = await flowStore.readDeltas(id);
      const graph = projector.project(id, deltas);
      const all = await problemStore.listAll();
      const meta = all.find((p) => p.id === id);
      return json({
        graph,
        deltaCount: deltas.length,
        problemTitle: meta?.title ?? null,
        problemStatus: meta?.status ?? null,
      });
    },

    "/api/wiki": async () => {
      const reader = new WikiReader(memoryDir);
      const pages = await reader.listCanonicalPages();
      const rows = pages
        .map((p) => ({
          id: p.frontmatter.id,
          type: p.frontmatter.type,
          status: p.frontmatter.status,
          confidence: (p.frontmatter as { confidence?: string }).confidence ?? null,
          path: p.path,
          updatedAt: p.frontmatter.updated_at,
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
      return json({ count: rows.length, pages: rows });
    },

    "/api/search": (req) => {
      const url = new URL(req.url);
      const query = (url.searchParams.get("q") ?? "").trim();
      if (!query) return json({ query: "", hits: [] });
      if (!existsSync(indexPath)) return json({ query, hits: [], indexMissing: true });

      const index = new SearchIndex(indexPath);
      const embedder = new HashedNgramEmbedder();
      const hits = index.searchWikiHybrid(query, embedder, { limit: 10 });
      index.close();
      return json({
        query,
        hits: hits.map((h) => ({ pageId: h.pageId, type: h.type, status: h.status, snippet: h.snippet.trim() })),
      });
    },

    "/api/index-status": async () => {
      if (!existsSync(indexPath)) return json({ exists: false, indexPath });
      const index = new SearchIndex(indexPath);
      const status = {
        exists: true,
        indexPath,
        rebuiltAt: index.getMeta("rebuilt_at"),
        wikiCount: Number(index.getMeta("wiki_count") ?? 0),
        claimCount: Number(index.getMeta("claim_count") ?? 0),
        skillCount: Number(index.getMeta("skill_count") ?? 0),
        vectorDims: Number(index.getMeta("vector_dims") ?? 0),
      };
      index.close();
      return json(status);
    },

    "/api/capture-status": async () => {
      const summary = await summarizeCaptureQueue(resolveRepoRoot(), STORAGE_ROOT);
      return json({ counts: summary.counts, draftCount: summary.drafts.length, drafts: summary.drafts });
    },
  },
  fetch() {
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`[cfgm-viewer] listening at http://localhost:${server.port}`);
console.log(`[cfgm-viewer] storage root: ${STORAGE_ROOT}`);
