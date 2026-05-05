#!/usr/bin/env bun
import index from "./cfgm-ssl-viewer.html";
import { Glob } from "bun";
import { resolve } from "node:path";
import { stat } from "node:fs/promises";
import { SearchIndex } from "../src/core/search/SearchIndex";
import { SSLReader } from "../src/core/search/SSLReader";
import { SSLRiskDetector } from "../src/core/governance/reports/SSLRiskDetector";
import { SSL_VERSION, type SSLDocument } from "../src/core/ontology/ssl";

/**
 * cfgm-ssl-viewer — KG-Brain 대시보드.
 *
 * 사용법:
 *   bun run bin/cfgm-ssl-viewer.ts                              # localhost:4041
 *   CFGM_SSL_VIEWER_PORT=8080 bun run bin/cfgm-ssl-viewer.ts
 *
 * docs/RULES.md 원칙 준수 — LLM API 호출 없음. memory/ 디렉토리만 읽음.
 *
 * Routes:
 *   GET /                         정적 HTML
 *   GET /api/skills               SSL 문서 list + queue 상태 합본
 *   GET /api/skills/:slug         SSL 문서 상세 + 해당 skill 의 risk findings
 *   GET /api/search?q=...         skill discovery (FTS5 BM25 가중치)
 *   GET /api/queue                pending normalize queue 상태
 *   GET /api/risk                 SSL risk detector 전체 출력
 */

const REPO_ROOT = process.env.CFGM_PROJECT_ROOT ?? process.env.CFGM_PROJECT ?? process.cwd();
const PORT = Number(process.env.CFGM_SSL_VIEWER_PORT ?? 4041);
const MEMORY_DIR = resolve(REPO_ROOT, "memory");
const JOBS_DIR = resolve(MEMORY_DIR, "_pending/normalize/jobs");

const STATUS_RE = /^status:\s*(\w+)\s*$/m;
const SLUG_FROM_FILE_RE = /^(.+)\.job\.md$/;

function json(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init?.headers ?? {}) },
  });
}

async function loadAllSSL(): Promise<SSLDocument[]> {
  const reader = new SSLReader(MEMORY_DIR);
  const { docs } = await reader.readAll();
  return docs;
}

async function loadQueueStatus(): Promise<Record<string, string>> {
  // slug → status
  const out: Record<string, string> = {};
  let dirExists = false;
  try { dirExists = (await stat(JOBS_DIR)).isDirectory(); } catch { /* none */ }
  if (!dirExists) return out;
  const glob = new Glob("**/*.job.md");
  for await (const rel of glob.scan({ cwd: JOBS_DIR })) {
    const slugMatch = rel.match(SLUG_FROM_FILE_RE);
    if (!slugMatch) continue;
    const slug = slugMatch[1];
    const txt = await Bun.file(resolve(JOBS_DIR, rel)).text();
    const m = txt.match(STATUS_RE);
    out[slug] = (m ? m[1] : "unknown").toLowerCase();
  }
  return out;
}

function buildIndex(docs: SSLDocument[]): SearchIndex {
  const idx = new SearchIndex(":memory:");
  idx.rebuild({ wikiPages: [], claims: [], skills: docs });
  return idx;
}

function slugOf(doc: SSLDocument): string {
  return doc.scheduling.id.split("#")[0];
}

async function loadHeuristicSidecar(slug: string): Promise<SSLDocument | null> {
  const sidecarPath = resolve(JOBS_DIR, `${slug}.heuristic.json`);
  const file = Bun.file(sidecarPath);
  if (!(await file.exists())) return null;
  try {
    const doc = (await file.json()) as SSLDocument;
    if (!doc.scheduling || !doc.scheduling.id) return null;
    return doc;
  } catch {
    return null;
  }
}

const server = Bun.serve({
  port: PORT,
  development: { console: true },
  routes: {
    "/": index,

    "/api/skills": async () => {
      const docs = await loadAllSSL();
      const queue = await loadQueueStatus();
      const summaries = docs.map((d) => ({
        slug: slugOf(d),
        name: d.scheduling.skillName,
        generatedBy: d.generatedBy,
        warnings: d.warnings.length,
        queueStatus: queue[slugOf(d)] ?? null,
      }));
      // include skills that exist only in queue (no SSL JSON yet)
      const seen = new Set(summaries.map((s) => s.slug));
      for (const [slug, status] of Object.entries(queue)) {
        if (seen.has(slug)) continue;
        summaries.push({
          slug,
          name: slug,
          generatedBy: "heuristic",
          warnings: 0,
          queueStatus: status,
        });
      }
      summaries.sort((a, b) => a.name.localeCompare(b.name));
      return json({ sslVersion: SSL_VERSION, skills: summaries });
    },

    "/api/skills/:slug": async (req) => {
      const slug = req.params.slug;
      const docs = await loadAllSSL();
      const doc = docs.find((d) => slugOf(d) === slug);
      const queue = await loadQueueStatus();
      const queueStatus = queue[slug] ?? null;

      if (!doc) {
        // skill exists in queue only — surface the heuristic excerpt from job file
        const queued = await loadHeuristicSidecar(slug);
        if (queued) {
          const findings = new SSLRiskDetector().detect({
            claims: [], wikiPages: [], skills: [queued], now: new Date().toISOString(),
          }).findings;
          return json({ doc: queued, queueStatus, risk: findings });
        }
        return json({ error: `skill not found: ${slug}` }, { status: 404 });
      }

      const findings = new SSLRiskDetector().detect({
        claims: [], wikiPages: [], skills: [doc], now: new Date().toISOString(),
      }).findings;
      return json({ doc, queueStatus, risk: findings });
    },

    "/api/search": async (req) => {
      const url = new URL(req.url);
      const q = url.searchParams.get("q") ?? "";
      if (!q.trim()) return json({ hits: [] });
      const docs = await loadAllSSL();
      // include queued docs in search too, so users can find pre-LLM results
      const queue = await loadQueueStatus();
      const queuedSlugs = new Set(Object.keys(queue));
      const knownSlugs = new Set(docs.map(slugOf));
      for (const slug of queuedSlugs) {
        if (knownSlugs.has(slug)) continue;
        const queued = await loadHeuristicSidecar(slug);
        if (queued) docs.push(queued);
      }
      const idx = buildIndex(docs);
      const hits = idx.searchSkills(q, { limit: 20 });
      idx.close();
      return json({ q, hits });
    },

    "/api/queue": async () => {
      const counts: Record<string, number> = { pending: 0, in_progress: 0, done: 0, failed: 0, unknown: 0 };
      const queue = await loadQueueStatus();
      for (const status of Object.values(queue)) {
        counts[status] = (counts[status] ?? 0) + 1;
      }
      return json({ counts, jobs: queue });
    },

    "/api/risk": async () => {
      const docs = await loadAllSSL();
      const queue = await loadQueueStatus();
      const knownSlugs = new Set(docs.map(slugOf));
      for (const slug of Object.keys(queue)) {
        if (knownSlugs.has(slug)) continue;
        const queued = await loadHeuristicSidecar(slug);
        if (queued) docs.push(queued);
      }
      const report = new SSLRiskDetector().detect({
        claims: [], wikiPages: [], skills: docs, now: new Date().toISOString(),
      });
      return json(report);
    },
  },
  fetch() {
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`[cfgm-ssl-viewer] http://localhost:${server.port}`);
console.log(`[cfgm-ssl-viewer] memory dir: ${MEMORY_DIR}`);
