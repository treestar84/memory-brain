# Executable SSL (V3.24) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SSL 그래프에 `instructions` 슬롯을 추가해 SKILL.md 없이 SSL JSON만으로 실행 계획을 생성하거나 interactive하게 단계별 안내할 수 있게 한다.

**Architecture:** `LogicalNode.instructions?: string` 필드로 "어떻게"를 담고, `SSLRunner`가 structural 그래프를 traverse해 `Step[]`을 생성한다. `cfgm-run` CLI가 두 가지 모드(plan-generator / interactive)로 이를 노출한다.

**Tech Stack:** Bun, TypeScript, `bun:sqlite` (기존), `node:readline` (interactive 모드)

---

## File Map

| 파일 | 변경 유형 | 역할 |
|---|---|---|
| `src/core/ontology/ssl.ts` | 수정 | `LogicalNode.instructions?` 추가, SSL_VERSION 0.3.1 |
| `src/core/runner/SSLRunner.ts` | 신규 | 그래프 traverse → Step[] 생성 |
| `bin/cfgm-run.ts` | 신규 | CLI (plan-generator + interactive) |
| `memory/concepts/_ssl/app-store-screenshots.json` | 수정 | 7개 logical 노드에 instructions 채움 |
| `tests/core/runner/SSLRunner.test.ts` | 신규 | SSLRunner 단위 테스트 |
| `tests/bin/cfgm-run.test.ts` | 신규 | cfgm-run CLI 스모크 테스트 |

---

## Task 1: ssl.ts — LogicalNode.instructions 필드 + v0.3.1

**Files:**
- Modify: `src/core/ontology/ssl.ts`

- [ ] **Step 1: SSL_VERSION 및 LogicalNode 타입 수정**

`src/core/ontology/ssl.ts`에서 다음을 변경한다:

```typescript
// 1) 버전 bump
export const SSL_VERSION = "0.3.1" as const;

// 2) LogicalNode에 instructions 추가 (effects[] 바로 아래)
export type LogicalNode = {
  id: string;
  action: Action;
  description: string;
  resources: ResourceScope[];
  actionRef?: string;
  resourceTarget?: string;
  effects: string[];
  evidenceClaimIds: string[];
  /** Executable directive — natural-language instruction for the LLM/user to follow.
   *  Optional: back-compat with existing SSL JSON (no instructions = structural-only). */
  instructions?: string;
};
```

- [ ] **Step 2: validateSSL에서 instructions 빈 문자열 체크 추가**

`validateSSL` 함수 내 logical 노드 검증 부분(기존 effects 체크 아래)에 추가:

```typescript
// instructions 있으면 비어있지 않아야 함
if (l.instructions !== undefined && l.instructions.trim() === "") {
  errors.push(`logical[${i}].instructions: must not be empty string`);
}
```

- [ ] **Step 3: SSLDocument의 sslVersion 타입 확인**

`SSLDocument.sslVersion: typeof SSL_VERSION`이 `"0.3.1"`로 자동 변경된다. 기존 JSON들은 `"0.3.0"`을 가지고 있으므로 validateSSL이 sslVersion을 strict 비교하는지 확인한다. strict 비교가 있으면 version 체크를 `startsWith("0.3")` 방식으로 완화한다.

`src/core/ontology/ssl.ts`의 validateSSL에서 sslVersion 체크를 찾아 확인:

```bash
grep -n "sslVersion" src/core/ontology/ssl.ts
```

sslVersion strict 비교가 있으면:
```typescript
// 기존: if (doc.sslVersion !== SSL_VERSION)
// 변경: minor version 호환 허용
if (!doc.sslVersion?.startsWith("0.3")) {
  errors.push(`sslVersion must be 0.3.x, got ${doc.sslVersion}`);
}
```

- [ ] **Step 4: bun test 전체 실행, 회귀 확인**

```bash
bun test 2>&1 | tail -5
```

Expected: 기존 866 pass, 0 fail (숫자는 변동 없어야 함)

- [ ] **Step 5: commit**

```bash
git add src/core/ontology/ssl.ts
git commit -m "feat(ssl): v0.3.1 — LogicalNode.instructions? 필드 추가

optional back-compat. validateSSL: 빈 문자열 금지.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: SSLRunner — 그래프 traverse + Step[] 생성

**Files:**
- Create: `src/core/runner/SSLRunner.ts`
- Create: `tests/core/runner/SSLRunner.test.ts`

- [ ] **Step 1: 테스트 파일 먼저 작성 (TDD)**

`tests/core/runner/SSLRunner.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { SSLRunner } from "../../../src/core/runner/SSLRunner";
import type { SSLDocument } from "../../../src/core/ontology/ssl";

// 최소 SSLDocument fixture (app-store-screenshots 구조 기반)
const fixture: SSLDocument = {
  sslVersion: "0.3.1" as any,
  sourceSkillPath: ".claude/skills/test/SKILL.md",
  sourceSha256: "abc123",
  generatedAt: "2026-05-08T00:00:00.000Z",
  generatedBy: "llm",
  scheduling: {
    id: "test#scheduling",
    skillName: "test",
    skillGoal: "Test skill",
    intentSignature: "test",
    intentSignatures: ["test"],
    triggerPatterns: [],
    expectedInputs: ["input_a"],
    expectedOutputs: ["output_b"],
    dependencies: [],
    controlFlowFeatures: [],
    ioContract: { inputsRaw: "", outputsRaw: "" },
    preconditions: [],
  },
  structural: [
    {
      id: "test#scene:REASON:1",
      scene: "REASON",
      sceneGoal: "Collect inputs",
      summary: "Collect inputs",
      containsLogicalIds: ["test#logical:1"],
      transitionsTo: ["test#scene:ACT:2"],
    },
    {
      id: "test#scene:ACT:2",
      scene: "ACT",
      sceneGoal: "Do the work",
      summary: "Do the work",
      containsLogicalIds: ["test#logical:2", "test#logical:3"],
      transitionsTo: [],
    },
  ],
  logical: [
    {
      id: "test#logical:1",
      action: "EMIT",
      description: "Ask user",
      resources: ["MEMORY"],
      effects: ["user_input_collected"],
      evidenceClaimIds: [],
      instructions: "Ask the user for input_a.",
    },
    {
      id: "test#logical:2",
      action: "WRITE",
      description: "Write file A",
      resources: ["LOCAL_FS"],
      effects: ["file_a_written"],
      evidenceClaimIds: [],
      instructions: "Write output to file-a.txt",
    },
    {
      id: "test#logical:3",
      action: "WRITE",
      description: "Write file B",
      resources: ["LOCAL_FS"],
      effects: ["file_b_written"],
      evidenceClaimIds: [],
      instructions: "Write output to file-b.txt",
    },
  ],
  interactions: [
    {
      id: "test#interaction:1",
      scopeRef: "test#scene:REASON:1",
      prompt: "Please provide input_a:",
      expectedResponseType: "free-text",
      variables: [],
    },
  ],
  decisions: [
    {
      id: "test#decision:1",
      scopeRef: "test#scene:REASON:1",
      question: "Should we proceed?",
      branches: [{ when: "yes", then: "Continue" }],
      fallback: "Stop",
    },
  ],
  evidence: [],
  protocols: [],
  warnings: [],
};

describe("SSLRunner", () => {
  test("produces steps for each scene in order", () => {
    const runner = new SSLRunner();
    const result = runner.run(fixture);

    // scene 순서: REASON:1 → ACT:2
    const sceneIds = result.steps.map((s) => s.sceneId);
    expect(sceneIds[0]).toBe("test#scene:REASON:1");
    expect(sceneIds[sceneIds.length - 1]).toBe("test#scene:ACT:2");
  });

  test("emits collect step for InteractionNode", () => {
    const runner = new SSLRunner();
    const result = runner.run(fixture);
    const collectSteps = result.steps.filter((s) => s.kind === "collect");
    expect(collectSteps.length).toBe(1);
    expect((collectSteps[0] as any).interactionNode.prompt).toBe(
      "Please provide input_a:"
    );
  });

  test("emits branch step for DecisionNode", () => {
    const runner = new SSLRunner();
    const result = runner.run(fixture);
    const branchSteps = result.steps.filter((s) => s.kind === "branch");
    expect(branchSteps.length).toBe(1);
    expect((branchSteps[0] as any).decisionNode.question).toBe(
      "Should we proceed?"
    );
  });

  test("marks independent same-scene logical nodes as parallel", () => {
    const runner = new SSLRunner();
    const result = runner.run(fixture);
    const execSteps = result.steps.filter((s) => s.kind === "execute");
    // test#logical:2 와 test#logical:3 는 effect 의존성 없음 → parallel
    const actStep = execSteps.find((s) => s.sceneId === "test#scene:ACT:2") as any;
    expect(actStep).toBeDefined();
    expect(actStep.parallel).toBe(true);
    expect(actStep.logicalNodes.length).toBe(2);
  });

  test("single logical node in scene is not parallel", () => {
    const runner = new SSLRunner();
    const result = runner.run(fixture);
    const execSteps = result.steps.filter((s) => s.kind === "execute");
    const reasonStep = execSteps.find(
      (s) => s.sceneId === "test#scene:REASON:1"
    ) as any;
    expect(reasonStep).toBeDefined();
    expect(reasonStep.parallel).toBe(false);
  });

  test("initialises RunState with empty collections", () => {
    const runner = new SSLRunner();
    const result = runner.run(fixture);
    expect(result.state.inputs).toEqual({});
    expect(result.state.decisions).toEqual({});
    expect(result.state.completedEffects).toEqual([]);
  });

  test("skillSlug matches scheduling.skillName", () => {
    const runner = new SSLRunner();
    const result = runner.run(fixture);
    expect(result.skillSlug).toBe("test");
  });

  test("handles document with no interactions or decisions", () => {
    const minimal: SSLDocument = {
      ...fixture,
      interactions: [],
      decisions: [],
    };
    const runner = new SSLRunner();
    expect(() => runner.run(minimal)).not.toThrow();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
bun test tests/core/runner/SSLRunner.test.ts 2>&1 | tail -10
```

Expected: `Cannot find module '../../../src/core/runner/SSLRunner'` 오류로 FAIL

- [ ] **Step 3: SSLRunner 구현**

`src/core/runner/SSLRunner.ts`:

```typescript
import type {
  SSLDocument,
  StructuralNode,
  LogicalNode,
  InteractionNode,
  DecisionNode,
} from "../ontology/ssl";

export interface CollectStep {
  kind: "collect";
  sceneId: string;
  sceneGoal: string;
  interactionNode: InteractionNode;
}

export interface BranchStep {
  kind: "branch";
  sceneId: string;
  sceneGoal: string;
  decisionNode: DecisionNode;
}

export interface ExecuteStep {
  kind: "execute";
  sceneId: string;
  sceneGoal: string;
  logicalNodes: LogicalNode[];
  parallel: boolean;
}

export type Step = CollectStep | BranchStep | ExecuteStep;

export interface RunState {
  inputs: Record<string, string>;
  decisions: Record<string, string>;
  completedEffects: string[];
}

export interface RunResult {
  skillSlug: string;
  steps: Step[];
  state: RunState;
}

export class SSLRunner {
  run(doc: SSLDocument): RunResult {
    const ordered = this.sortScenes(doc.structural);
    const steps: Step[] = [];

    for (const scene of ordered) {
      // InteractionNodes scoped to this scene
      for (const node of doc.interactions ?? []) {
        if (node.scopeRef === scene.id) {
          steps.push({
            kind: "collect",
            sceneId: scene.id,
            sceneGoal: scene.sceneGoal,
            interactionNode: node,
          });
        }
      }

      // DecisionNodes scoped to this scene
      for (const node of doc.decisions ?? []) {
        if (node.scopeRef === scene.id) {
          steps.push({
            kind: "branch",
            sceneId: scene.id,
            sceneGoal: scene.sceneGoal,
            decisionNode: node,
          });
        }
      }

      // Logical nodes contained in this scene
      const logicalNodes = scene.containsLogicalIds
        .map((lid) => doc.logical.find((l) => l.id === lid))
        .filter((l): l is LogicalNode => l !== undefined);

      if (logicalNodes.length > 0) {
        steps.push({
          kind: "execute",
          sceneId: scene.id,
          sceneGoal: scene.sceneGoal,
          logicalNodes,
          parallel: logicalNodes.length > 1 && this.isParallelSafe(logicalNodes),
        });
      }
    }

    return {
      skillSlug: doc.scheduling.skillName,
      steps,
      state: { inputs: {}, decisions: {}, completedEffects: [] },
    };
  }

  /** BFS topological sort on structural transitionsTo edges. */
  private sortScenes(structural: StructuralNode[]): StructuralNode[] {
    const idMap = new Map(structural.map((s) => [s.id, s]));
    const inDegree = new Map<string, number>(structural.map((s) => [s.id, 0]));

    for (const s of structural) {
      for (const t of s.transitionsTo) {
        inDegree.set(t, (inDegree.get(t) ?? 0) + 1);
      }
    }

    const queue = structural.filter((s) => (inDegree.get(s.id) ?? 0) === 0);
    const result: StructuralNode[] = [];

    while (queue.length > 0) {
      const node = queue.shift()!;
      result.push(node);
      for (const t of node.transitionsTo) {
        const deg = (inDegree.get(t) ?? 1) - 1;
        inDegree.set(t, deg);
        if (deg === 0) {
          const next = idMap.get(t);
          if (next) queue.push(next);
        }
      }
    }

    // fallback: append any nodes not reached (disconnected)
    for (const s of structural) {
      if (!result.find((r) => r.id === s.id)) result.push(s);
    }

    return result;
  }

  /**
   * Two or more logical nodes are parallel-safe when no node's
   * resourceTarget appears in another node's effects list.
   */
  private isParallelSafe(nodes: LogicalNode[]): boolean {
    const allEffects = new Set(nodes.flatMap((n) => n.effects));
    for (const n of nodes) {
      if (n.resourceTarget && allEffects.has(n.resourceTarget)) return false;
    }
    return true;
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
bun test tests/core/runner/SSLRunner.test.ts 2>&1 | tail -5
```

Expected: `7 pass, 0 fail`

- [ ] **Step 5: 전체 회귀 확인**

```bash
bun test 2>&1 | tail -5
```

Expected: 기존 pass 수 + 7 통과, 0 fail

- [ ] **Step 6: commit**

```bash
git add src/core/runner/SSLRunner.ts tests/core/runner/SSLRunner.test.ts
git commit -m "feat(runner): SSLRunner — SSL 그래프 traverse + Step[] 생성

BFS topological sort + parallel 감지. 7 테스트 통과.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: cfgm-run CLI

**Files:**
- Create: `bin/cfgm-run.ts`
- Create: `tests/bin/cfgm-run.test.ts`

- [ ] **Step 1: 테스트 파일 먼저 작성 (TDD)**

`tests/bin/cfgm-run.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

const CLI = resolve(import.meta.dir, "../../bin/cfgm-run.ts");
const SSL_JSON = resolve(
  import.meta.dir,
  "../../memory/concepts/_ssl/app-store-screenshots.json"
);

describe("cfgm-run CLI", () => {
  test("exits 3 with no args", async () => {
    const proc = Bun.spawn(["bun", CLI], { stderr: "pipe" });
    await proc.exited;
    expect(proc.exitCode).toBe(3);
  });

  test("exits 2 when skill slug not found", async () => {
    const proc = Bun.spawn(["bun", CLI, "--skill", "nonexistent-skill-xyz"], {
      stderr: "pipe",
    });
    await proc.exited;
    expect(proc.exitCode).toBe(2);
  });

  test("plan-generator mode outputs markdown plan", async () => {
    if (!existsSync(SSL_JSON)) return; // skip if file missing
    const proc = Bun.spawn(
      ["bun", CLI, "--skill", "app-store-screenshots"],
      { stdout: "pipe", stderr: "pipe" }
    );
    await proc.exited;
    const out = await new Response(proc.stdout).text();
    expect(proc.exitCode).toBe(0);
    expect(out).toContain("# Execution Plan");
    expect(out).toContain("app-store-screenshots");
  });

  test("--json flag outputs valid JSON", async () => {
    if (!existsSync(SSL_JSON)) return;
    const proc = Bun.spawn(
      ["bun", CLI, "--skill", "app-store-screenshots", "--json"],
      { stdout: "pipe", stderr: "pipe" }
    );
    await proc.exited;
    const out = await new Response(proc.stdout).text();
    expect(proc.exitCode).toBe(0);
    expect(() => JSON.parse(out)).not.toThrow();
    const parsed = JSON.parse(out);
    expect(parsed.skillSlug).toBe("app-store-screenshots");
    expect(Array.isArray(parsed.steps)).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
bun test tests/bin/cfgm-run.test.ts 2>&1 | tail -10
```

Expected: FAIL (파일 없음)

- [ ] **Step 3: cfgm-run.ts 구현**

`bin/cfgm-run.ts`:

```typescript
#!/usr/bin/env bun
import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import * as readline from "node:readline";
import { SSLRunner } from "../src/core/runner/SSLRunner";
import type { SSLDocument } from "../src/core/ontology/ssl";
import type { Step, ExecuteStep, CollectStep, BranchStep } from "../src/core/runner/SSLRunner";

/**
 * cfgm-run — Executable SSL runner (V3.24)
 *
 * 사용법:
 *   bun cfgm-run --skill <slug>              # plan-generator (기본)
 *   bun cfgm-run --skill <slug> --interactive # 터미널 단계별 실행
 *   bun cfgm-run --skill <slug> --json        # machine-readable JSON
 *
 * 종료 코드:
 *   0 — 정상
 *   2 — skill 파일 없음 / JSON 파싱 실패
 *   3 — 인자 부족
 *
 * docs/RULES.md 원칙 준수: MCP 없음, LLM API 직접 호출 없음.
 */

const args = process.argv.slice(2);

function parseArgs(args: string[]) {
  const opts: {
    skill?: string;
    interactive: boolean;
    json: boolean;
  } = { interactive: false, json: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--skill" && args[i + 1]) opts.skill = args[++i];
    else if (args[i] === "--interactive") opts.interactive = true;
    else if (args[i] === "--json") opts.json = true;
  }
  return opts;
}

const opts = parseArgs(args);

if (!opts.skill) {
  console.error("usage: bun cfgm-run --skill <slug> [--interactive] [--json]");
  process.exit(3);
}

// SSL JSON 탐색: memory/concepts/_ssl/<slug>.json
const sslPath = resolve(process.cwd(), "memory/concepts/_ssl", `${opts.skill}.json`);

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
function renderPlan(result: ReturnType<SSLRunner["run"]>): string {
  const lines: string[] = [];
  lines.push(`# Execution Plan: ${result.skillSlug}`);
  lines.push("");

  let stepNum = 0;
  let currentScene = "";

  for (const step of result.steps) {
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
      lines.push(`> Expected response: **${s.interactionNode.expectedResponseType}**`);
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
  return new Promise((resolve) => rl.question(prompt, resolve));
}

const state = result.state;
const replayLines: string[] = [`# Replay: ${result.skillSlug}`, ""];
let stepNum = 0;

for (const step of result.steps) {
  stepNum++;

  if (step.kind === "collect") {
    const s = step as CollectStep;
    console.log(`\n[STEP ${stepNum}] COLLECT`);
    console.log(`Scene: ${s.sceneGoal}`);
    console.log(`\n> ${s.interactionNode.prompt}`);
    const answer = await ask("Your answer: ");
    state.inputs[s.interactionNode.id] = answer;
    replayLines.push(`## Collect — ${s.interactionNode.id}`);
    replayLines.push(`answer: ${answer}`);
    replayLines.push("");
  } else if (step.kind === "branch") {
    const s = step as BranchStep;
    console.log(`\n[STEP ${stepNum}] BRANCH`);
    console.log(`Scene: ${s.sceneGoal}`);
    console.log(`\n? ${s.decisionNode.question}`);
    s.decisionNode.branches.forEach((b, i) =>
      console.log(`  ${i + 1}. ${b.when}`)
    );
    if (s.decisionNode.fallback) console.log(`  0. (default) ${s.decisionNode.fallback}`);
    const choice = await ask("Choice (number): ");
    const idx = parseInt(choice, 10) - 1;
    const selected = s.decisionNode.branches[idx]?.when ?? s.decisionNode.fallback ?? "";
    state.decisions[s.decisionNode.id] = selected;
    replayLines.push(`## Branch — ${s.decisionNode.id}`);
    replayLines.push(`selected: ${selected}`);
    replayLines.push("");
  } else {
    const s = step as ExecuteStep;
    const parallelLabel = s.parallel ? " (run in parallel)" : "";
    console.log(`\n[STEP ${stepNum}] EXECUTE${parallelLabel}`);
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
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
bun test tests/bin/cfgm-run.test.ts 2>&1 | tail -5
```

Expected: `4 pass, 0 fail`

- [ ] **Step 5: 전체 회귀 확인**

```bash
bun test 2>&1 | tail -5
```

Expected: 기존 + 11 pass (7 SSLRunner + 4 cfgm-run), 0 fail

- [ ] **Step 6: package.json scripts 추가**

`package.json`의 `scripts` 섹션에 추가:

```json
"run:skill": "bun bin/cfgm-run.ts"
```

- [ ] **Step 7: commit**

```bash
git add bin/cfgm-run.ts tests/bin/cfgm-run.test.ts package.json
git commit -m "feat(cli): cfgm-run — plan-generator + interactive SSL runner

--interactive: readline 단계별 실행 + replay 파일 저장.
기본 모드: markdown plan 출력 + run-plan.md 저장.
4 테스트 통과.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: app-store-screenshots.json — instructions 채우기

**Files:**
- Modify: `memory/concepts/_ssl/app-store-screenshots.json`

- [ ] **Step 1: 7개 logical 노드에 instructions 추가**

`memory/concepts/_ssl/app-store-screenshots.json`의 각 logical 노드에 아래 instructions를 추가한다.

`app-store-screenshots#logical:1`:
```json
"instructions": "Ask the user these 7 questions in order before writing any code:\n1. App screenshot file paths (PNG)\n2. App icon path\n3. Brand colors (accent, text, background)\n4. Font name\n5. Feature list in priority order\n6. Desired slide count (Apple max 10, Play max 8)\n7. Style direction (e.g. warm/minimal/dark) + any reference screenshots"
```

`app-store-screenshots#logical:2`:
```json
"instructions": "From the answers, decide (without asking): background style (gradient direction, colors), decorative elements (blobs/glows/none), dark vs light slide ratio, typography treatment, RTL behavior for ar/he/fa/ur locales, theme preset names."
```

`app-store-screenshots#logical:3`:
```json
"instructions": "Detect package manager (bun > pnpm > yarn > npm). Run scaffold command, e.g.:\n  bunx create-next-app@latest . --typescript --tailwind --app --src-dir --no-eslint --import-alias '@/*'\n  bun add html-to-image\nCopy mockup.png from skill directory to public/."
```

`app-store-screenshots#logical:4`:
```json
"instructions": "Write src/app/layout.tsx with the user's chosen font via next/font. Set metadata.title to the app name."
```

`app-store-screenshots#logical:5`:
```json
"instructions": "Plan: slide count per platform, slide order (feature priority), headline text per slide, which slides are dark vs light, which device frames appear (iPhone/iPad/Android phone/tablet/Feature Graphic). Output a slide table before writing code."
```

`app-store-screenshots#logical:6`:
```json
"instructions": "Write src/app/page.tsx as a single file containing: (1) theme preset system, (2) base64 image preloader (all PNGs → data URIs on mount), (3) slide factory functions — one per slide type, (4) device frame components (iPhone uses mockup.png; Android/iPad use CSS-only frames), (5) export button wired to html-to-image. Use canvas dimensions matching the largest required device resolution."
```

`app-store-screenshots#logical:7`:
```json
"instructions": "Export via html-to-image's toPng(). IMPORTANT: call toPng() twice — the first call warms up resources (fonts, images), the second produces clean output. Save each PNG at the exact required resolution: iPhone 1290×2796, iPad 2048×2732, Android phone 1080×1920, Feature Graphic 1024×500."
```

- [ ] **Step 2: validateSSL 통과 확인**

```bash
bun bin/cfgm-ssl-validate.ts memory/concepts/_ssl/app-store-screenshots.json
```

Expected: `✓ valid`

- [ ] **Step 3: cfgm-run 동작 확인**

```bash
bun bin/cfgm-run.ts --skill app-store-screenshots 2>/dev/null | head -40
```

Expected: `# Execution Plan: app-store-screenshots` + scene/step 목록 출력

- [ ] **Step 4: commit**

```bash
git add memory/concepts/_ssl/app-store-screenshots.json
git commit -m "feat(kg): app-store-screenshots SSL instructions 채움

7개 logical 노드에 실행 지시 추가.
cfgm-run --skill app-store-screenshots 으로 실행 계획 생성 가능.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec 커버리지:**
- [x] ssl.ts v0.3.1 + instructions 필드 → Task 1
- [x] SSLRunner 그래프 traverse + Step[] → Task 2
- [x] cfgm-run plan-generator + interactive → Task 3
- [x] app-store-screenshots instructions → Task 4
- [x] 병렬 감지 (isParallelSafe) → Task 2 SSLRunner
- [x] replay 파일 저장 → Task 3 interactive 모드
- [x] --json 출력 → Task 3

**타입 일관성:**
- `SSLRunner.run()` → `RunResult` (Task 2 정의, Task 3 소비) ✓
- `Step` union type (`CollectStep | BranchStep | ExecuteStep`) Task 2 정의, Task 3 소비 ✓
- `LogicalNode.instructions?` Task 1 정의, Task 2/3/4 소비 ✓

**Placeholder 없음:** 모든 step에 실제 코드/명령어 포함 ✓
