#!/usr/bin/env bun
import index from "./cfgm-ssl-viewer.html";
import workflowPage from "./cfgm-workflow-viewer.html";
import { Glob } from "bun";
import { resolve } from "node:path";
import { stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { Database } from "bun:sqlite";
import { SearchIndex } from "../src/core/search/SearchIndex";
import { SSLReader } from "../src/core/search/SSLReader";
import { SSLRiskDetector } from "../src/core/governance/reports/SSLRiskDetector";
import { SSL_VERSION, type SSLDocument } from "../src/core/ontology/ssl";
import { resolveStorageRoot, resolveRepoRoot } from "../src/hooks/bootstrap";

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

interface WorkflowAction {
  id: string;
  action: string;
  actionRef: string | null;
  description: string;
  resourceTarget: string | null;
  effects: string[];
}

const REPO_ROOT = resolveRepoRoot();
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

    "/workflow": workflowPage,

    "/api/workflow/:slug": async (req) => {
      const slug = req.params.slug;
      const dbPath = resolve(resolveStorageRoot(), "indexes/search.sqlite");

      if (!existsSync(dbPath)) {
        return json({ error: "index not found — run cfgm-rebuild-index first" }, { status: 404 });
      }

      const db = new Database(dbPath, { readonly: true });
      try {
        // 1. Scheduling node → skillName, skillGoal, intentSignature
        const schedulingRow = db
          .query<{ properties: string }, [string]>(
            "SELECT properties FROM kg_nodes WHERE node_type = 'scheduling' AND skill_slug = ? LIMIT 1"
          )
          .get(slug);

        let skillName = slug;
        let skillGoal = "";
        let intentSignature = "";
        if (schedulingRow) {
          try {
            const p = JSON.parse(schedulingRow.properties) as Record<string, unknown>;
            skillName = (p.skillName as string) ?? slug;
            skillGoal = (p.skillGoal as string) ?? "";
            intentSignature = (p.intentSignature as string) ?? "";
          } catch { /* malformed JSON — use defaults */ }
        }

        // 2. Structural nodes (scenes)
        const structuralRows = db
          .query<
            { node_id: string; scene: string; properties: string },
            [string]
          >(
            "SELECT node_id, scene, properties FROM kg_nodes WHERE node_type = 'structural' AND skill_slug = ?"
          )
          .all(slug);

        // 3. TRANSITIONS_TO edges for topological sort
        const transitionEdges = db
          .query<{ from_id: string; to_id: string }, [string]>(
            "SELECT from_id, to_id FROM kg_edges WHERE relation = 'TRANSITIONS_TO' AND from_skill = ?"
          )
          .all(slug);

        // 4. CONTAINS edges (scene → action nodes)
        const containsEdges = db
          .query<{ from_id: string; to_id: string }, [string]>(
            "SELECT from_id, to_id FROM kg_edges WHERE relation = 'CONTAINS' AND from_skill = ?"
          )
          .all(slug);

        // 5. DELEGATES_TO edges
        const delegateEdges = db
          .query<{ from_id: string; to_id: string; resolved: number; properties: string }, [string]>(
            "SELECT from_id, to_id, resolved, properties FROM kg_edges WHERE relation = 'DELEGATES_TO' AND from_skill = ?"
          )
          .all(slug);

        // Topological sort of scenes via BFS
        const sceneMap = new Map(structuralRows.map((r) => [r.node_id, r]));
        const adjOut = new Map<string, string[]>();
        const inDegree = new Map<string, number>();
        for (const r of structuralRows) {
          adjOut.set(r.node_id, []);
          inDegree.set(r.node_id, 0);
        }
        for (const e of transitionEdges) {
          if (!adjOut.has(e.from_id) || !sceneMap.has(e.to_id)) continue;
          adjOut.get(e.from_id)!.push(e.to_id);
          inDegree.set(e.to_id, (inDegree.get(e.to_id) ?? 0) + 1);
        }

        let sortedSceneIds: string[];
        if (transitionEdges.length === 0) {
          // fallback: alphabetical
          sortedSceneIds = structuralRows.map((r) => r.node_id).sort();
        } else {
          const queue: string[] = [];
          for (const [id, deg] of inDegree) {
            if (deg === 0) queue.push(id);
          }
          queue.sort(); // deterministic tie-break
          sortedSceneIds = [];
          const visited = new Set<string>();
          while (queue.length > 0) {
            const id = queue.shift()!;
            if (visited.has(id)) continue;
            visited.add(id);
            sortedSceneIds.push(id);
            const neighbors = (adjOut.get(id) ?? []).slice().sort();
            for (const nid of neighbors) {
              const newDeg = (inDegree.get(nid) ?? 1) - 1;
              inDegree.set(nid, newDeg);
              if (newDeg === 0) queue.push(nid);
            }
          }
          // append any unvisited (cycle members or disconnected)
          for (const r of structuralRows) {
            if (!visited.has(r.node_id)) sortedSceneIds.push(r.node_id);
          }
        }

        // Collect logical node IDs per scene from CONTAINS edges
        const sceneToActionIds = new Map<string, string[]>();
        for (const e of containsEdges) {
          if (!sceneToActionIds.has(e.from_id)) sceneToActionIds.set(e.from_id, []);
          sceneToActionIds.get(e.from_id)!.push(e.to_id);
        }

        // Fetch all logical nodes in one query
        const allActionIds = containsEdges.map((e) => e.to_id);
        let logicalRows: Array<{ node_id: string; action: string; properties: string }> = [];
        if (allActionIds.length > 0) {
          const placeholders = allActionIds.map(() => "?").join(",");
          logicalRows = db
            .query<{ node_id: string; action: string; properties: string }, string[]>(
              `SELECT node_id, action, properties FROM kg_nodes WHERE node_id IN (${placeholders})`
            )
            .all(...allActionIds);
        }
        const logicalMap = new Map(logicalRows.map((r) => [r.node_id, r]));

        // Build scenes array
        const scenes = sortedSceneIds.map((sceneId, order) => {
          const sceneRow = sceneMap.get(sceneId)!;
          let sceneGoal = "";
          try {
            const p = JSON.parse(sceneRow.properties) as Record<string, unknown>;
            sceneGoal = (p.sceneGoal as string) ?? (p.goal as string) ?? "";
          } catch { /* ignore */ }

          const actionIds = sceneToActionIds.get(sceneId) ?? [];
          const actions = actionIds.map((aid) => {
            const aRow = logicalMap.get(aid);
            if (!aRow) return null;
            let actionRef: string | null = null;
            let description = "";
            let resourceTarget: string | null = null;
            let effects: string[] = [];
            try {
              const p = JSON.parse(aRow.properties) as Record<string, unknown>;
              actionRef = (p.actionRef as string) ?? null;
              description = (p.description as string) ?? (p.label as string) ?? "";
              resourceTarget = (p.resourceTarget as string) ?? null;
              effects = Array.isArray(p.effects) ? (p.effects as string[]) : [];
            } catch { /* ignore */ }
            return {
              id: aid,
              action: aRow.action ?? "",
              actionRef,
              description,
              resourceTarget,
              effects,
            };
          }).filter(Boolean) as WorkflowAction[];

          const transitionsTo = (adjOut.get(sceneId) ?? []);

          return {
            id: sceneId,
            scene: sceneRow.scene ?? "",
            sceneGoal,
            order,
            actions,
            transitionsTo,
          };
        });

        // Build delegations
        const delegations = delegateEdges.map((e) => {
          let whenCondition: string | null = null;
          try {
            const p = JSON.parse(e.properties) as Record<string, unknown>;
            whenCondition = (p.whenCondition as string) ?? null;
          } catch { /* ignore */ }
          return {
            fromProtocolId: e.from_id,
            toSkill: e.to_id.split("#")[0],
            toNodeId: e.to_id,
            resolved: e.resolved === 1,
            whenCondition,
          };
        });

        const danglingDelegations = delegations.filter((d) => !d.resolved).length;

        return json({
          slug,
          skillName,
          skillGoal,
          intentSignature,
          scenes,
          delegations,
          stats: {
            sceneCount: scenes.length,
            actionCount: scenes.reduce((s, sc) => s + sc.actions.length, 0),
            danglingDelegations,
          },
        });
      } finally {
        db.close();
      }
    },
  },
  fetch() {
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`[cfgm-ssl-viewer] http://localhost:${server.port}`);
console.log(`[cfgm-ssl-viewer] memory dir: ${MEMORY_DIR}`);
