#!/usr/bin/env bun
import index from "./cfgm-viewer.html";
import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { FlowGraphStore } from "../src/core/flow/FlowGraphStore";
import { FlowGraphProjector } from "../src/core/flow/FlowGraphProjector";
import { ActiveProblemStore } from "../src/core/binder/ActiveProblemStore";
import { resolve } from "node:path";
import { resolveStorageRoot, resolveRepoRoot } from "../src/hooks/bootstrap";
import { UsageLog } from "../src/core/stats/UsageLog";
import { estimateMemoryCorpusTokens } from "../src/core/stats/TokenEstimate";

const STORAGE_ROOT = resolveStorageRoot();
const PORT = Number(process.env.CFGM_VIEWER_PORT ?? 4040);

const storage = new FsStorage(STORAGE_ROOT);
const clock = new RealClock();
const problemStore = new ActiveProblemStore(storage, clock);
const flowStore = new FlowGraphStore(storage, clock);
const projector = new FlowGraphProjector();
const usageLog = new UsageLog(storage);

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
  },
  fetch() {
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`[cfgm-viewer] listening at http://localhost:${server.port}`);
console.log(`[cfgm-viewer] storage root: ${STORAGE_ROOT}`);
