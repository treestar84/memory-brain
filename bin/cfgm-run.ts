#!/usr/bin/env bun
import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import * as readline from "node:readline";
import { SSLRunner } from "../src/core/runner/SSLRunner";
import type { SSLDocument } from "../src/core/ontology/ssl";
import { validateSSL } from "../src/core/ontology/ssl";
import type {
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

// Validate slug to prevent path traversal
if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(opts.skill)) {
  console.error(`error: invalid --skill slug — must match [a-z0-9][a-z0-9_-]{0,62} (lowercase)`);
  process.exit(3);
}

const repoRoot = process.env.CFGM_PROJECT_ROOT ?? process.env.CFGM_PROJECT ?? process.cwd();
const REPLAY_DIR = resolve(repoRoot, "memory/_pending/replay");

// SSL JSON 탐색: memory/concepts/_ssl/<slug>.json
const sslPath = resolve(
  repoRoot,
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

const sslErrors = validateSSL(doc);
if (sslErrors.length > 0) {
  console.error(`error: SSL validation failed — ${sslPath}`);
  sslErrors.forEach((e) => console.error(`  • ${e}`));
  process.exit(2);
}

const runner = new SSLRunner();
const result = runner.run(doc);

if (opts.json) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

function renderPlan(runResult: RunResult): string {
  const lines: string[] = [];
  lines.push(`# Execution Plan: ${runResult.skillSlug}`);
  lines.push("");

  let currentScene = "";

  for (const [idx, step] of runResult.steps.entries()) {
    if (step.sceneId !== currentScene) {
      currentScene = step.sceneId;
      lines.push(`## Scene — ${step.sceneGoal}`);
      lines.push("");
    }

    if (step.kind === "collect") {
      lines.push(`### [STEP ${idx + 1}] COLLECT — User Input Required`);
      lines.push("");
      lines.push(`> ${step.interactionNode.prompt}`);
      lines.push(
        `> Expected response: **${step.interactionNode.expectedResponseType}**`
      );
      lines.push("");
    } else if (step.kind === "branch") {
      lines.push(`### [STEP ${idx + 1}] BRANCH — Decision Point`);
      lines.push("");
      lines.push(`**Question:** ${step.decisionNode.question}`);
      lines.push("");
      step.decisionNode.branches.forEach((b, i) => {
        lines.push(`- ${i + 1}. **${b.when}** → ${b.then}`);
      });
      if (step.decisionNode.fallback) {
        lines.push(`- _default_ → ${step.decisionNode.fallback}`);
      }
      lines.push("");
    } else if (step.kind === "execute") {
      const parallelLabel = step.parallel ? " *(parallel)*" : "";
      lines.push(`### [STEP ${idx + 1}] EXECUTE${parallelLabel}`);
      lines.push("");
      for (const node of step.logicalNodes) {
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
    } else {
      const _exhaustive: never = step;
      throw new Error(`unhandled step kind: ${(_exhaustive as {kind: string}).kind}`);
    }
  }

  return lines.join("\n");
}

if (!opts.interactive) {
  const plan = renderPlan(result);
  console.log(plan);

  const outPath = join(REPLAY_DIR, `${opts.skill}.run-plan.md`);
  await Bun.write(outPath, plan);
  console.error(`\n→ plan saved: ${outPath}`);
  process.exit(0);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(prompt: string): Promise<string> {
  return new Promise((res) => rl.question(prompt, res));
}

const state = result.state;
const replayLines: string[] = [`# Replay: ${result.skillSlug}`, ""];

for (const [idx, step] of result.steps.entries()) {
  if (step.kind === "collect") {
    console.log(`\n[STEP ${idx + 1}] COLLECT`);
    console.log(`Scene: ${step.sceneGoal}`);
    console.log(`\n> ${step.interactionNode.prompt}`);
    const answer = await ask("Your answer: ");
    state.inputs[step.interactionNode.id] = answer;
    replayLines.push(`## Collect — ${step.interactionNode.id}`);
    replayLines.push(`answer: ${answer}`);
    replayLines.push("");
  } else if (step.kind === "branch") {
    console.log(`\n[STEP ${idx + 1}] BRANCH`);
    console.log(`Scene: ${step.sceneGoal}`);
    console.log(`\n? ${step.decisionNode.question}`);
    step.decisionNode.branches.forEach((b, i) =>
      console.log(`  ${i + 1}. ${b.when}`)
    );
    if (step.decisionNode.fallback) {
      console.log(`  0. (default) ${step.decisionNode.fallback}`);
    }
    const choice = await ask("Choice (number, 1–" + step.decisionNode.branches.length + "): ");
    const choiceIdx = parseInt(choice, 10) - 1;
    const selected =
      Number.isInteger(choiceIdx) && choiceIdx >= 0 && choiceIdx < step.decisionNode.branches.length
        ? step.decisionNode.branches[choiceIdx].when
        : (step.decisionNode.fallback ?? "");
    state.decisions[step.decisionNode.id] = selected;
    replayLines.push(`## Branch — ${step.decisionNode.id}`);
    replayLines.push(`selected: ${selected}`);
    replayLines.push("");
  } else if (step.kind === "execute") {
    const parallelLabel = step.parallel ? " (run in parallel)" : "";
    console.log(`\n[STEP ${idx + 1}] EXECUTE${parallelLabel}`);
    console.log(`Scene: ${step.sceneGoal}`);
    for (const node of step.logicalNodes) {
      console.log(`\n  • ${node.id} [${node.action}]`);
      if (node.instructions) console.log(`    ${node.instructions}`);
    }
    const done = await ask("Done? (y/n): ");
    if (done.toLowerCase() === "y") {
      const effects = step.logicalNodes.flatMap((n) => n.effects);
      state.completedEffects.push(...effects);
      replayLines.push(`## Execute — ${step.logicalNodes.map((n) => n.id).join(", ")}`);
      replayLines.push(`completed: true`);
      replayLines.push(`effects: ${effects.join(", ")}`);
      replayLines.push("");
    } else {
      replayLines.push(`## Execute — ${step.logicalNodes.map((n) => n.id).join(", ")}`);
      replayLines.push(`skipped: true`);
      replayLines.push("");
    }
  } else {
    const _exhaustive: never = step;
    throw new Error(`unhandled step kind: ${(_exhaustive as {kind: string}).kind}`);
  }
}

rl.close();

const outPath = join(REPLAY_DIR, `${opts.skill}.replay.md`);
await Bun.write(outPath, replayLines.join("\n"));
console.log(`\n✓ replay saved: ${outPath}`);
