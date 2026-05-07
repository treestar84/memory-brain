#!/usr/bin/env bun
import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import * as readline from "node:readline";
import { SSLRunner } from "../src/core/runner/SSLRunner";
import type { SSLDocument } from "../src/core/ontology/ssl";
import type {
  Step,
  ExecuteStep,
  CollectStep,
  BranchStep,
  RunResult,
} from "../src/core/runner/SSLRunner";

/**
 * cfgm-run — Executable SSL runner (V3.24)
 *
 * 사용법:
 *   bun cfgm-run --skill <slug>               # plan-generator (기본)
 *   bun cfgm-run --skill <slug> --interactive  # 터미널 단계별 실행
 *   bun cfgm-run --skill <slug> --json         # machine-readable JSON
 *
 * 종료 코드:
 *   0 — 정상
 *   2 — skill 파일 없음 / JSON 파싱 실패
 *   3 — 인자 부족
 */

const args = process.argv.slice(2);

interface CliOpts {
  skill?: string;
  interactive: boolean;
  json: boolean;
}

function parseArgs(rawArgs: string[]): CliOpts {
  const opts: CliOpts = { interactive: false, json: false };
  for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i] === "--skill" && rawArgs[i + 1]) {
      opts.skill = rawArgs[++i];
    } else if (rawArgs[i] === "--interactive") {
      opts.interactive = true;
    } else if (rawArgs[i] === "--json") {
      opts.json = true;
    }
  }
  return opts;
}

const opts = parseArgs(args);

if (!opts.skill) {
  console.error("usage: bun cfgm-run --skill <slug> [--interactive] [--json]");
  process.exit(3);
}

// SSL JSON 탐색: memory/concepts/_ssl/<slug>.json
const sslPath = resolve(
  process.cwd(),
  "memory/concepts/_ssl",
  `${opts.skill}.json`
);

if (!existsSync(sslPath)) {
  console.error(`error: SSL JSON not found — ${sslPath}`);
  console.error(`hint: run 'bun cfgm-ssl-normalize' first`);
  process.exit(2);
}

let doc: SSLDocument;
try {
  doc = (await Bun.file(sslPath).json()) as SSLDocument;
} catch (e) {
  console.error(`error: invalid JSON — ${(e as Error).message}`);
  process.exit(2);
}

const runner = new SSLRunner();
const result = runner.run(doc);

// ── JSON 모드 ──────────────────────────────────────────────
if (opts.json) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

// ── Plan-generator 모드 ────────────────────────────────────
function renderPlan(runResult: RunResult): string {
  const lines: string[] = [];
  lines.push(`# Execution Plan: ${runResult.skillSlug}`);
  lines.push("");

  let stepNum = 0;
  let currentScene = "";

  for (const step of runResult.steps) {
    if (step.sceneId !== currentScene) {
      currentScene = step.sceneId;
      lines.push(`## Scene — ${step.sceneGoal}`);
      lines.push("");
    }

    stepNum++;

    if (step.kind === "collect") {
      const s = step as CollectStep;
      lines.push(`### [STEP ${stepNum}] COLLECT — User Input Required`);
      lines.push("");
      lines.push(`> ${s.interactionNode.prompt}`);
      lines.push(
        `> Expected response: **${s.interactionNode.expectedResponseType}**`
      );
      lines.push("");
    } else if (step.kind === "branch") {
      const s = step as BranchStep;
      lines.push(`### [STEP ${stepNum}] BRANCH — Decision Point`);
      lines.push("");
      lines.push(`**Question:** ${s.decisionNode.question}`);
      lines.push("");
      s.decisionNode.branches.forEach((b, i) => {
        lines.push(`- ${i + 1}. **${b.when}** → ${b.then}`);
      });
      if (s.decisionNode.fallback) {
        lines.push(`- _default_ → ${s.decisionNode.fallback}`);
      }
      lines.push("");
    } else {
      const s = step as ExecuteStep;
      const parallelLabel = s.parallel ? " *(parallel)*" : "";
      lines.push(`### [STEP ${stepNum}] EXECUTE${parallelLabel}`);
      lines.push("");
      for (const node of s.logicalNodes) {
        lines.push(`**${node.id}** — \`${node.action}\``);
        if (node.instructions) {
          lines.push("");
          lines.push(node.instructions);
        }
        if (node.effects.length > 0) {
          lines.push(`_effects: ${node.effects.join(", ")}_`);
        }
        lines.push("");
      }
    }
  }

  return lines.join("\n");
}

if (!opts.interactive) {
  const plan = renderPlan(result);
  console.log(plan);

  // replay 파일로도 저장
  const outDir = resolve(process.cwd(), "memory/_pending/replay");
  const outPath = join(outDir, `${opts.skill}.run-plan.md`);
  await Bun.write(outPath, plan);
  console.error(`\n→ plan saved: ${outPath}`);
  process.exit(0);
}

// ── Interactive 모드 ───────────────────────────────────────
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(prompt: string): Promise<string> {
  return new Promise((res) => rl.question(prompt, res));
}

const state = result.state;
const replayLines: string[] = [`# Replay: ${result.skillSlug}`, ""];
let stepNumI = 0;

for (const step of result.steps) {
  stepNumI++;

  if (step.kind === "collect") {
    const s = step as CollectStep;
    console.log(`\n[STEP ${stepNumI}] COLLECT`);
    console.log(`Scene: ${s.sceneGoal}`);
    console.log(`\n> ${s.interactionNode.prompt}`);
    const answer = await ask("Your answer: ");
    state.inputs[s.interactionNode.id] = answer;
    replayLines.push(`## Collect — ${s.interactionNode.id}`);
    replayLines.push(`answer: ${answer}`);
    replayLines.push("");
  } else if (step.kind === "branch") {
    const s = step as BranchStep;
    console.log(`\n[STEP ${stepNumI}] BRANCH`);
    console.log(`Scene: ${s.sceneGoal}`);
    console.log(`\n? ${s.decisionNode.question}`);
    s.decisionNode.branches.forEach((b, i) =>
      console.log(`  ${i + 1}. ${b.when}`)
    );
    if (s.decisionNode.fallback) {
      console.log(`  0. (default) ${s.decisionNode.fallback}`);
    }
    const choice = await ask("Choice (number): ");
    const idx = parseInt(choice, 10) - 1;
    const selected =
      s.decisionNode.branches[idx]?.when ?? s.decisionNode.fallback ?? "";
    state.decisions[s.decisionNode.id] = selected;
    replayLines.push(`## Branch — ${s.decisionNode.id}`);
    replayLines.push(`selected: ${selected}`);
    replayLines.push("");
  } else {
    const s = step as ExecuteStep;
    const parallelLabel = s.parallel ? " (run in parallel)" : "";
    console.log(`\n[STEP ${stepNumI}] EXECUTE${parallelLabel}`);
    console.log(`Scene: ${s.sceneGoal}`);
    for (const node of s.logicalNodes) {
      console.log(`\n  • ${node.id} [${node.action}]`);
      if (node.instructions) console.log(`    ${node.instructions}`);
    }
    const done = await ask("Done? (y/n): ");
    if (done.toLowerCase() === "y") {
      const effects = s.logicalNodes.flatMap((n) => n.effects);
      state.completedEffects.push(...effects);
      replayLines.push(`## Execute — ${s.logicalNodes.map((n) => n.id).join(", ")}`);
      replayLines.push(`completed: true`);
      replayLines.push(`effects: ${effects.join(", ")}`);
      replayLines.push("");
    }
  }
}

rl.close();

// replay 파일 저장
const outDir = resolve(process.cwd(), "memory/_pending/replay");
const outPath = join(outDir, `${opts.skill}.replay.md`);
await Bun.write(outPath, replayLines.join("\n"));
console.log(`\n✓ replay saved: ${outPath}`);
