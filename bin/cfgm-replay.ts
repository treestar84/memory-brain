#!/usr/bin/env bun
/**
 * cfgm-replay — SSL 기반 워크플로우 재실행 계획 생성
 *
 * "수행해라" 명령 진입점. SSL document 를 읽어 scene 순서에 따른
 * 실행 계획 markdown 을 생성. host LLM 이 이 파일을 읽고 단계별 실행.
 *
 * 사용법:
 *   bun run bin/cfgm-replay.ts --slug <slug>
 *   bun run bin/cfgm-replay.ts --query "ssl normalize workflow"
 *   bun run bin/cfgm-replay.ts --slug <slug> --output <path>
 *   bun run bin/cfgm-replay.ts --list
 *
 * docs/RULES.md 원칙 2 준수: LLM API 직접 호출 없음.
 * host LLM 이 생성된 replay plan 파일을 읽고 자기 inference 채널로 실행.
 */

import { Glob } from "bun";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { Database } from "bun:sqlite";
import type { SSLDocument, StructuralNode, LogicalNode, DecisionNode, InteractionNode, EvidenceNode, ProtocolNode } from "../src/core/ontology/ssl";
import { SCENES } from "../src/core/ontology/ssl";
import { KGComposer } from "../src/core/search/KGComposer";
import { resolveRepoRoot } from "../src/hooks/bootstrap";

interface ParsedArgs {
  slug: string | null;
  query: string | null;
  list: boolean;
  chain: boolean;
  outputPath: string | null;
  sslDir: string;
  json: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const repoRoot =
    resolveRepoRoot();
  const out: ParsedArgs = {
    slug: null,
    query: null,
    list: false,
    chain: false,
    outputPath: null,
    sslDir: resolve(repoRoot, "memory/concepts/_ssl"),
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--slug" && argv[i + 1]) { out.slug = argv[++i]!; continue; }
    if (a === "--query" && argv[i + 1]) { out.query = argv[++i]!; continue; }
    if (a === "--output" && argv[i + 1]) { out.outputPath = resolve(repoRoot, argv[++i]!); continue; }
    if (a === "--list") { out.list = true; continue; }
    if (a === "--chain") { out.chain = true; continue; }
    if (a === "--json") { out.json = true; continue; }
  }
  return out;
}

function usage(): void {
  console.error("Usage:");
  console.error("  bun run bin/cfgm-replay.ts --slug <slug>");
  console.error("  bun run bin/cfgm-replay.ts --query \"ssl normalize workflow\"");
  console.error("  bun run bin/cfgm-replay.ts --slug <slug> --output <path>");
  console.error("  bun run bin/cfgm-replay.ts --slug <slug> --json");
  console.error("  bun run bin/cfgm-replay.ts --slug <slug> --chain   # hierarchical chain plan");
  console.error("  bun run bin/cfgm-replay.ts --list");
}

function scoreQuery(doc: SSLDocument, tokens: string[]): number {
  const s = doc.scheduling;
  const fields = [
    s.skillName,
    s.intentSignature,
    ...(s.intentSignatures ?? []),
    ...(s.triggerPatterns ?? []),
  ].join(" ").toLowerCase();
  return tokens.filter((t) => fields.includes(t)).length;
}

async function loadAllSSL(sslDir: string): Promise<Array<{ slug: string; doc: SSLDocument }>> {
  const results: Array<{ slug: string; doc: SSLDocument }> = [];
  const glob = new Glob("*.json");
  for await (const rel of glob.scan({ cwd: sslDir })) {
    const slug = rel.replace(/\.json$/, "");
    try {
      const doc = (await Bun.file(resolve(sslDir, rel)).json()) as SSLDocument;
      results.push({ slug, doc });
    } catch {
      // skip malformed
    }
  }
  return results;
}

// Build replay plan markdown from SSL document
export function buildReplayPlan(doc: SSLDocument): string {
  const s = doc.scheduling;
  const slug = s.id.split("#")[0] ?? s.skillName;
  const now = new Date().toISOString();

  const decisions: DecisionNode[] = doc.decisions ?? [];
  const interactions: InteractionNode[] = doc.interactions ?? [];
  const evidence: EvidenceNode[] = doc.evidence ?? [];
  const protocols: ProtocolNode[] = doc.protocols ?? [];

  // Build logical index by id
  const logicalById = new Map<string, LogicalNode>(doc.logical.map((l) => [l.id, l]));

  // Build structural index by id
  const structuralById = new Map<string, StructuralNode>(doc.structural.map((st) => [st.id, st]));

  // Sort scenes by SCENES constant order
  const sceneOrder = new Map<string, number>(SCENES.map((sc, i) => [sc, i]));
  const sortedStructural = [...doc.structural].sort((a, b) => {
    return (sceneOrder.get(a.scene) ?? 999) - (sceneOrder.get(b.scene) ?? 999);
  });

  // Assign decisions/interactions/protocols to structural scenes by scopeRef
  // scopeRef can be structural id or logical id; logical id → find its structural scene
  function findStructuralForScope(scopeRef: string | undefined): string | null {
    if (!scopeRef) return null;
    if (structuralById.has(scopeRef)) return scopeRef;
    // logical id → find which structural contains it
    for (const st of doc.structural) {
      if (st.containsLogicalIds.includes(scopeRef)) return st.id;
    }
    return null;
  }

  // Group decisions by structural id
  const decisionsByScene = new Map<string, DecisionNode[]>();
  const unscopedDecisions: DecisionNode[] = [];
  for (const d of decisions) {
    const sid = findStructuralForScope(d.scopeRef);
    if (sid) {
      if (!decisionsByScene.has(sid)) decisionsByScene.set(sid, []);
      decisionsByScene.get(sid)!.push(d);
    } else {
      unscopedDecisions.push(d);
    }
  }

  // Group interactions by structural id
  const interactionsByScene = new Map<string, InteractionNode[]>();
  const unscopedInteractions: InteractionNode[] = [];
  for (const n of interactions) {
    const sid = findStructuralForScope(n.scopeRef);
    if (sid) {
      if (!interactionsByScene.has(sid)) interactionsByScene.set(sid, []);
      interactionsByScene.get(sid)!.push(n);
    } else {
      unscopedInteractions.push(n);
    }
  }

  // Group protocols by structural id
  const protocolsByScene = new Map<string, ProtocolNode[]>();
  const unscopedProtocols: ProtocolNode[] = [];
  for (const p of protocols) {
    const sid = findStructuralForScope(p.scopeRef);
    if (sid) {
      if (!protocolsByScene.has(sid)) protocolsByScene.set(sid, []);
      protocolsByScene.get(sid)!.push(p);
    } else {
      unscopedProtocols.push(p);
    }
  }

  const lines: string[] = [];

  // Header frontmatter
  lines.push("---");
  lines.push(`replay_for: ${slug}`);
  lines.push(`generated_at: ${now}`);
  lines.push(`ssl_version: ${doc.sslVersion}`);
  lines.push("status: ready");
  lines.push("---");
  lines.push("");
  lines.push(`# Replay Plan: ${s.skillName}`);
  lines.push("");
  lines.push(`> **Goal**: ${s.skillGoal}`);
  lines.push(`>`);
  lines.push(`> **Intent**: ${s.intentSignature}`);
  lines.push(`>`);
  lines.push(`> **Trigger patterns**: ${(s.triggerPatterns ?? []).join(", ")}`);
  lines.push("");
  lines.push("## 실행 방법");
  lines.push("");
  lines.push("이 파일을 읽고 Scene 순서대로 Logical Actions 를 수행한다.");
  lines.push("- Decision 은 조건을 평가해 분기한다.");
  lines.push("- Interaction 은 사용자에게 발화 후 응답 대기한다.");
  lines.push("- Protocol 은 지정된 skill 에 위임한다.");
  lines.push("- 각 Scene 완료 후 다음 Scene 으로 이동한다.");
  lines.push("");
  lines.push("---");
  lines.push("");

  // Scene blocks
  for (const st of sortedStructural) {
    lines.push(`### Scene: ${st.scene} — ${st.sceneGoal || st.summary}`);
    lines.push("");

    // Logical actions
    const logicals = st.containsLogicalIds
      .map((id) => logicalById.get(id))
      .filter((l): l is LogicalNode => l !== undefined);

    if (logicals.length > 0) {
      lines.push("**Logical Actions:**");
      for (let i = 0; i < logicals.length; i++) {
        const l = logicals[i]!;
        lines.push(`${i + 1}. \`[${l.action}]\` ${l.description}`);
        lines.push(`   - Resources: ${l.resources.join(", ") || "none"}`);
        if (l.effects && l.effects.length > 0) {
          lines.push(`   - Effects: ${l.effects.join("; ")}`);
        }
      }
      lines.push("");
    }

    // Decisions for this scene
    const sceneDecisions = decisionsByScene.get(st.id) ?? [];
    if (sceneDecisions.length > 0) {
      lines.push("**Decisions:**");
      for (const d of sceneDecisions) {
        lines.push(`- **Q: ${d.question}**`);
        for (const b of d.branches) {
          lines.push(`  - If ${b.when} → ${b.then}`);
        }
        if (d.fallback) {
          lines.push(`  - Fallback: ${d.fallback}`);
        }
      }
      lines.push("");
    }

    // Interactions for this scene
    const sceneInteractions = interactionsByScene.get(st.id) ?? [];
    if (sceneInteractions.length > 0) {
      lines.push("**Interactions (pause for user):**");
      for (const n of sceneInteractions) {
        lines.push(`- Ask: "${n.prompt}"`);
        lines.push(`  - Expected: ${n.expectedResponseType}`);
        if (n.options && n.options.length > 0) {
          lines.push(`  - Options: ${n.options.join(", ")}`);
        }
      }
      lines.push("");
    }

    // Protocols for this scene
    const sceneProtocols = protocolsByScene.get(st.id) ?? [];
    if (sceneProtocols.length > 0) {
      lines.push("**Protocols (delegate):**");
      for (const p of sceneProtocols) {
        lines.push(`- Delegate to \`${p.delegateTo}\` when: ${p.whenCondition}`);
        if (p.inputsForward && p.inputsForward.length > 0) {
          lines.push(`  - Pass: ${p.inputsForward.join(", ")}`);
        }
        if (p.outputsExpected && p.outputsExpected.length > 0) {
          lines.push(`  - Expect back: ${p.outputsExpected.join(", ")}`);
        }
      }
      lines.push("");
    }
  }

  // Unscoped nodes section
  const hasUnscoped =
    unscopedDecisions.length > 0 ||
    unscopedInteractions.length > 0 ||
    unscopedProtocols.length > 0;

  if (hasUnscoped) {
    lines.push("### 추가 노드 (scope 미지정)");
    lines.push("");
    if (unscopedDecisions.length > 0) {
      lines.push("**Decisions:**");
      for (const d of unscopedDecisions) {
        lines.push(`- **Q: ${d.question}**`);
        for (const b of d.branches) {
          lines.push(`  - If ${b.when} → ${b.then}`);
        }
        if (d.fallback) lines.push(`  - Fallback: ${d.fallback}`);
      }
      lines.push("");
    }
    if (unscopedInteractions.length > 0) {
      lines.push("**Interactions:**");
      for (const n of unscopedInteractions) {
        lines.push(`- Ask: "${n.prompt}"`);
        lines.push(`  - Expected: ${n.expectedResponseType}`);
      }
      lines.push("");
    }
    if (unscopedProtocols.length > 0) {
      lines.push("**Protocols:**");
      for (const p of unscopedProtocols) {
        lines.push(`- Delegate to \`${p.delegateTo}\` when: ${p.whenCondition}`);
      }
      lines.push("");
    }
  }

  // Footer
  lines.push("---");
  lines.push("");
  lines.push("## 성공 기준");
  lines.push("");

  if (evidence.length > 0) {
    for (const ev of evidence) {
      lines.push(`### Case: ${ev.caseLabel}`);
      lines.push(`- Inputs: ${JSON.stringify(ev.inputs)}`);
      lines.push(`- Expected outputs: ${JSON.stringify(ev.outputs)}`);
      lines.push("- Criteria:");
      for (const c of ev.successCriteria) {
        lines.push(`  - [ ] ${c}`);
      }
      lines.push("");
    }
  } else {
    lines.push("- [ ] 모든 Logical Actions 완료");
    lines.push("- [ ] VERIFY scene 통과");
    lines.push("");
  }

  return lines.join("\n");
}

export interface ChainEntry {
  slug: string;
  skillName: string;
  depth: number;
  delegatedBy: string | null;
}

export interface ChainReplayResult {
  rootSlug: string;
  chain: ChainEntry[];
  plan: string;
}

/**
 * Builds a hierarchical replay plan for a skill chain.
 * Uses KGComposer COMPOSES triples to discover the delegation chain
 * from rootSlug, then stitches per-skill replay sections in BFS order.
 */
export async function buildChainReplayPlan(
  rootSlug: string,
  sslDir: string,
  db: Database,
): Promise<ChainReplayResult> {
  const composer = new KGComposer(db);
  const { triples } = composer.compose();

  // Build BFS-ordered chain from rootSlug using COMPOSES triples
  // triples already have depth from KGComposer; filter to those from root
  const fromRoot = triples.filter((t) => t.fromSkill === rootSlug);
  fromRoot.sort((a, b) => a.depth - b.depth || a.toSkill.localeCompare(b.toSkill));

  // Load root SSL
  const allSlugs = [rootSlug, ...fromRoot.map((t) => t.toSkill)];
  const docs = new Map<string, SSLDocument>();
  for (const slug of allSlugs) {
    const file = Bun.file(resolve(sslDir, `${slug}.json`));
    if (await file.exists()) {
      try {
        docs.set(slug, (await file.json()) as SSLDocument);
      } catch {
        // skip malformed
      }
    }
  }

  // Build delegatedBy map: for each skill, who directly delegates to it
  // Use depth-1 (direct) DELEGATES_TO edges from kg_edges
  const directDelegators = new Map<string, string>();
  const directRows = db
    .query(
      `SELECT from_skill, to_skill FROM kg_edges
       WHERE relation = 'DELEGATES_TO' AND resolved = 1
         AND from_skill IS NOT NULL AND to_skill IS NOT NULL`,
    )
    .all() as Array<{ from_skill: string; to_skill: string }>;
  for (const row of directRows) {
    // record the first delegator found (BFS order from root)
    if (!directDelegators.has(row.to_skill)) {
      directDelegators.set(row.to_skill, row.from_skill);
    }
  }

  // Build chain entries
  const chain: ChainEntry[] = [
    {
      slug: rootSlug,
      skillName: docs.get(rootSlug)?.scheduling.skillName ?? rootSlug,
      depth: 0,
      delegatedBy: null,
    },
  ];
  for (const t of fromRoot) {
    chain.push({
      slug: t.toSkill,
      skillName: docs.get(t.toSkill)?.scheduling.skillName ?? t.toSkill,
      depth: t.depth,
      delegatedBy: directDelegators.get(t.toSkill) ?? null,
    });
  }

  // Build combined plan markdown
  const now = new Date().toISOString();
  const chainSlugs = chain.map((c) => c.slug).join(", ");
  const lines: string[] = [];

  lines.push("---");
  lines.push(`replay_for: ${rootSlug}`);
  lines.push("chain_mode: true");
  lines.push(`chain_skills: [${chainSlugs}]`);
  lines.push(`generated_at: ${now}`);
  lines.push("status: ready");
  lines.push("---");
  lines.push("");
  lines.push(`# Chain Replay Plan: ${chain[0]!.skillName}`);
  lines.push("");
  lines.push("> Execute each step in order. Delegated skills are sub-workflows.");
  lines.push(`> Chain depth: ${Math.max(...chain.map((c) => c.depth))}`);
  lines.push("");
  lines.push("## Execution Order");
  lines.push("");
  for (let i = 0; i < chain.length; i++) {
    const c = chain[i]!;
    const indent = "  ".repeat(c.depth);
    const delegated = c.delegatedBy ? ` ← delegated by \`${c.delegatedBy}\`` : "";
    lines.push(`${indent}${i + 1}. \`${c.slug}\` — ${c.skillName}${delegated}`);
  }
  lines.push("");
  lines.push("---");
  lines.push("");

  // Per-skill replay sections
  for (let i = 0; i < chain.length; i++) {
    const c = chain[i]!;
    const doc = docs.get(c.slug);

    lines.push(`## Step ${i + 1}: \`${c.slug}\` — ${c.skillName}`);
    if (c.delegatedBy) {
      lines.push("");
      lines.push(`> Delegated by: \`${c.delegatedBy}\``);
    }
    lines.push("");

    if (!doc) {
      lines.push(`_SSL document not found for \`${c.slug}\` — skipping._`);
    } else {
      // Embed the per-skill plan (strip frontmatter + top heading)
      const inner = buildReplayPlan(doc)
        .replace(/^---[\s\S]*?---\n/, "") // strip frontmatter
        .replace(/^# Replay Plan:.*\n/, "") // strip h1
        .trimStart();
      lines.push(inner);
    }

    lines.push("---");
    lines.push("");
  }

  return { rootSlug, chain, plan: lines.join("\n") };
}

// Main — guarded so that test imports don't trigger CLI execution
if (import.meta.main) {
const args = parseArgs(process.argv.slice(2));
const repoRoot = resolveRepoRoot();

if (!args.slug && !args.query && !args.list) {
  usage();
  process.exit(1);
}

if (args.list) {
  const all = await loadAllSSL(args.sslDir);
  if (all.length === 0) {
    console.log("no workflows found in memory/concepts/_ssl/");
  } else {
    console.log(`Available workflows (memory/concepts/_ssl/):`);
    // Tab-align: find max slug length
    const maxSlug = Math.max(...all.map((x) => x.slug.length));
    for (const { slug, doc } of all.sort((a, b) => a.slug.localeCompare(b.slug))) {
      console.log(`  ${slug.padEnd(maxSlug + 2)}${doc.scheduling.skillName}`);
    }
  }
  process.exit(0);
}

let slug: string;

if (args.query) {
  const tokens = args.query.toLowerCase().split(/\s+/).filter(Boolean);
  const all = await loadAllSSL(args.sslDir);
  if (all.length === 0) {
    console.error(`no matching SSL found for query: ${args.query}`);
    process.exit(1);
  }
  const scored = all
    .map((x) => ({ ...x, score: scoreQuery(x.doc, tokens) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) {
    console.error(`no matching SSL found for query: ${args.query}`);
    process.exit(1);
  }
  slug = scored[0]!.slug;
  if (scored.length > 1) {
    console.log(`Query matched ${scored.length} workflows, using: ${slug}`);
  }
} else {
  slug = args.slug!;
}

// --chain: hierarchical BFS chain replay plan
if (args.chain) {
  const indexPath = resolve(repoRoot, "memory/indexes/search.sqlite");
  if (!existsSync(indexPath)) {
    console.error("search.sqlite not found — run cfgm-rebuild-index first");
    process.exit(1);
  }
  const db = new Database(indexPath, { readonly: true });
  let result: Awaited<ReturnType<typeof buildChainReplayPlan>>;
  try {
    result = await buildChainReplayPlan(slug, args.sslDir, db);
  } finally {
    db.close();
  }

  const outputPath =
    args.outputPath ?? resolve(repoRoot, `memory/_pending/replay/${slug}-chain.replay.md`);
  await mkdir(resolve(outputPath, ".."), { recursive: true });
  await Bun.write(outputPath, result.plan);

  if (args.json) {
    console.log(JSON.stringify({ rootSlug: result.rootSlug, chain: result.chain, outputPath }, null, 2));
  } else {
    console.log(`Chain replay plan written to: ${outputPath}`);
    console.log(`Chain: ${result.chain.map((c) => c.slug).join(" → ")}`);
  }
  process.exit(0);
}

// Single-skill replay
const sslFile = Bun.file(resolve(args.sslDir, `${slug}.json`));
if (!(await sslFile.exists())) {
  console.error(`SSL document not found: ${slug}`);
  process.exit(1);
}

const doc = (await sslFile.json()) as SSLDocument;
const plan = buildReplayPlan(doc);

const outputPath =
  args.outputPath ?? resolve(repoRoot, `memory/_pending/replay/${slug}.replay.md`);

await mkdir(resolve(outputPath, ".."), { recursive: true });
await Bun.write(outputPath, plan);

if (args.json) {
  const out = {
    slug,
    skillName: doc.scheduling.skillName,
    outputPath,
    sceneCount: doc.structural.length,
    logicalCount: doc.logical.length,
    decisionCount: (doc.decisions ?? []).length,
  };
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log(`Replay plan written to: ${outputPath}`);
}
} // end import.meta.main
