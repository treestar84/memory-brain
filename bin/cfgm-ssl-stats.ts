#!/usr/bin/env bun
import { Glob } from "bun";
import { resolve } from "node:path";
import { loadCanonicalActions, defaultCanonicalActionsPath } from "../src/core/ontology/canonical";
import { CanonicalCandidatesDetector, buildKnownSignatures } from "../src/core/governance/reports/CanonicalCandidatesDetector";
import type { SSLDocument } from "../src/core/ontology/ssl";

/**
 * cfgm-ssl-stats — V3.17 효과 측정.
 *
 * 출력 지표:
 * - SSL 11개 평균/총 크기 (gzip 추정 — JSON 길이)
 * - canonical 사용률 (logical 노드 중 actionRef 사용 %)
 * - 4 신규 노드 채움률 (decisions/interactions/evidence/protocols 비어있지 않은 SSL 비율)
 * - SKILL.md vs SSL JSON 길이 비교 (축소 비율)
 * - dedup detector 결과 (canonical 후보 발견 수)
 *
 * 사용법: bun run bin/cfgm-ssl-stats.ts [--json]
 */

const repoRoot = process.env.CFGM_PROJECT_ROOT ?? process.cwd();
const json = process.argv.includes("--json");
const sslDir = resolve(repoRoot, "memory/concepts/_ssl");
const memoryDir = resolve(repoRoot, "memory");

interface SkillStat {
  slug: string;
  generatedBy: string;
  sslSize: number;
  skillMdSize: number;
  reductionPct: number;
  logicalCount: number;
  actionRefCount: number;
  refUsagePct: number;
  decisionsCount: number;
  interactionsCount: number;
  evidenceCount: number;
  protocolsCount: number;
}

const canonical = await loadCanonicalActions(defaultCanonicalActionsPath(memoryDir));
const knownSigs = buildKnownSignatures(Object.values({ ...canonical.items, ...canonical.extensions }));

const stats: SkillStat[] = [];
const allSSL: SSLDocument[] = [];

const glob = new Glob("*.json");
for await (const rel of glob.scan({ cwd: sslDir })) {
  const sslPath = resolve(sslDir, rel);
  const doc = (await Bun.file(sslPath).json()) as SSLDocument;
  allSSL.push(doc);

  const sslSize = (await Bun.file(sslPath).text()).length;
  let skillMdSize = 0;
  try { skillMdSize = (await Bun.file(resolve(repoRoot, doc.sourceSkillPath)).text()).length; } catch {}

  const logicalCount = doc.logical.length;
  const actionRefCount = doc.logical.filter((l) => !!l.actionRef).length;
  const refUsagePct = logicalCount > 0 ? (actionRefCount / logicalCount) * 100 : 0;
  const reductionPct = skillMdSize > 0 ? ((skillMdSize - sslSize) / skillMdSize) * 100 : 0;

  stats.push({
    slug: doc.scheduling.id.split("#")[0],
    generatedBy: doc.generatedBy,
    sslSize,
    skillMdSize,
    reductionPct,
    logicalCount,
    actionRefCount,
    refUsagePct,
    decisionsCount: (doc.decisions ?? []).length,
    interactionsCount: (doc.interactions ?? []).length,
    evidenceCount: (doc.evidence ?? []).length,
    protocolsCount: (doc.protocols ?? []).length,
  });
}

// Aggregates
const total = stats.length;
const totalLogical = stats.reduce((s, x) => s + x.logicalCount, 0);
const totalActionRef = stats.reduce((s, x) => s + x.actionRefCount, 0);
const avgSslSize = stats.reduce((s, x) => s + x.sslSize, 0) / Math.max(1, total);
const avgSkillMd = stats.reduce((s, x) => s + x.skillMdSize, 0) / Math.max(1, total);
const avgReduction = stats.reduce((s, x) => s + x.reductionPct, 0) / Math.max(1, total);
const avgRefUsage = totalLogical > 0 ? (totalActionRef / totalLogical) * 100 : 0;
const fillRates = {
  decisions: stats.filter((x) => x.decisionsCount > 0).length / Math.max(1, total) * 100,
  interactions: stats.filter((x) => x.interactionsCount > 0).length / Math.max(1, total) * 100,
  evidence: stats.filter((x) => x.evidenceCount > 0).length / Math.max(1, total) * 100,
  protocols: stats.filter((x) => x.protocolsCount > 0).length / Math.max(1, total) * 100,
};
const llmCount = stats.filter((x) => x.generatedBy === "llm").length;

// Dedup detector
const detector = new CanonicalCandidatesDetector();
const dedupReport = detector.detect({
  claims: [], wikiPages: [], skills: allSSL,
  knownCanonicalSignatures: knownSigs,
  now: new Date().toISOString(),
});

const summary = {
  total_skills: total,
  llm_normalized: llmCount,
  heuristic_only: total - llmCount,
  avg_ssl_size_bytes: Math.round(avgSslSize),
  avg_skill_md_size_bytes: Math.round(avgSkillMd),
  avg_size_reduction_pct: +avgReduction.toFixed(1),
  total_logical_nodes: totalLogical,
  total_actionref_used: totalActionRef,
  canonical_usage_pct: +avgRefUsage.toFixed(1),
  canonical_store_items: Object.keys(canonical.items).length,
  fill_rates_pct: {
    decisions: +fillRates.decisions.toFixed(1),
    interactions: +fillRates.interactions.toFixed(1),
    evidence: +fillRates.evidence.toFixed(1),
    protocols: +fillRates.protocols.toFixed(1),
  },
  dedup_candidates: dedupReport.findings.length,
  dedup_top: dedupReport.findings.slice(0, 5).map((f) => ({ signature: f.subject, message: f.message })),
};

if (json) {
  console.log(JSON.stringify({ summary, perSkill: stats }, null, 2));
} else {
  console.log(`SSL Stats — V3.17 효과 측정`);
  console.log(`────────────────────────────────────────`);
  console.log(`총 skill:           ${summary.total_skills}`);
  console.log(`  LLM normalized:   ${summary.llm_normalized}`);
  console.log(`  Heuristic only:   ${summary.heuristic_only}`);
  console.log(``);
  console.log(`크기 비교 (SSL vs SKILL.md)`);
  console.log(`  평균 SSL:         ${summary.avg_ssl_size_bytes} bytes`);
  console.log(`  평균 SKILL.md:    ${summary.avg_skill_md_size_bytes} bytes`);
  console.log(`  축소 비율:        ${summary.avg_size_reduction_pct}%   ${summary.avg_size_reduction_pct > 0 ? "← SSL 이 작음" : "← SKILL.md 가 작음"}`);
  console.log(``);
  console.log(`Canonical 사용률 (V3.17 핵심 지표)`);
  console.log(`  Logical 노드 총:  ${summary.total_logical_nodes}`);
  console.log(`  actionRef 사용:   ${summary.total_actionref_used}`);
  console.log(`  사용률:           ${summary.canonical_usage_pct}%   목표: ≥ 50%`);
  console.log(`  Canonical 시드:   ${summary.canonical_store_items} 항목`);
  console.log(``);
  console.log(`4 신규 노드 채움률 (skill 중 비어있지 않은 비율)`);
  console.log(`  Decisions:        ${summary.fill_rates_pct.decisions}%`);
  console.log(`  Interactions:     ${summary.fill_rates_pct.interactions}%`);
  console.log(`  Evidence:         ${summary.fill_rates_pct.evidence}%`);
  console.log(`  Protocols:        ${summary.fill_rates_pct.protocols}%`);
  console.log(``);
  console.log(`Dedup detector — 추가 canonical 후보`);
  console.log(`  발견된 후보:      ${summary.dedup_candidates} 건`);
  for (const c of summary.dedup_top) {
    console.log(`    - ${c.signature}: ${c.message}`);
  }
}
