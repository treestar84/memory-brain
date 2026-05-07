import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { SSL_VERSION } from "../../src/core/ontology/ssl";
import type { SSLDocument } from "../../src/core/ontology/ssl";

function makeSSL(slug: string, overrides: Partial<SSLDocument> = {}): SSLDocument {
  const base: SSLDocument = {
    sslVersion: SSL_VERSION,
    sourceSkillPath: `.claude/skills/${slug}/SKILL.md`,
    sourceSha256: "a".repeat(64),
    generatedAt: "2026-01-01T00:00:00.000Z",
    generatedBy: "heuristic",
    scheduling: {
      id: `${slug}#scheduling`,
      skillName: slug,
      skillGoal: `Execute ${slug} workflow`,
      intentSignature: `run ${slug}`,
      intentSignatures: [`run ${slug}`, `execute ${slug}`],
      triggerPatterns: [`${slug}`, `do ${slug}`],
      expectedInputs: [],
      expectedOutputs: [],
      dependencies: [],
      controlFlowFeatures: [],
      ioContract: { inputsRaw: "", outputsRaw: "" },
      preconditions: [],
    },
    structural: [
      {
        id: `${slug}#scene:PREPARE`,
        scene: "PREPARE",
        sceneGoal: "Prepare the environment",
        summary: "Prepare",
        containsLogicalIds: [`${slug}#logical:0`],
        transitionsTo: [`${slug}#scene:ACT`],
      },
      {
        id: `${slug}#scene:ACT`,
        scene: "ACT",
        sceneGoal: "Perform the main action",
        summary: "Act",
        containsLogicalIds: [`${slug}#logical:1`],
        transitionsTo: [`${slug}#scene:VERIFY`],
      },
      {
        id: `${slug}#scene:VERIFY`,
        scene: "VERIFY",
        sceneGoal: "Verify results",
        summary: "Verify",
        containsLogicalIds: [`${slug}#logical:2`],
        transitionsTo: [],
      },
    ],
    logical: [
      {
        id: `${slug}#logical:0`,
        action: "READ",
        description: "Read memory state",
        resources: ["MEMORY"],
        effects: ["memory loaded"],
        evidenceClaimIds: [],
      },
      {
        id: `${slug}#logical:1`,
        action: "WRITE",
        description: "Write output file",
        resources: ["LOCAL_FS"],
        effects: ["file written"],
        evidenceClaimIds: [],
      },
      {
        id: `${slug}#logical:2`,
        action: "INFER",
        description: "Verify output correctness",
        resources: ["MEMORY"],
        effects: ["verified"],
        evidenceClaimIds: [],
      },
    ],
    warnings: [],
    ...overrides,
  };
  return base;
}

function cli(projectDir: string, args: string[]) {
  return spawnSync("bun", ["run", "bin/cfgm-replay.ts", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, CFGM_PROJECT_ROOT: projectDir },
    encoding: "utf-8",
  });
}

async function writeSSL(projectDir: string, slug: string, doc: SSLDocument): Promise<void> {
  const sslDir = join(projectDir, "memory/concepts/_ssl");
  await mkdir(sslDir, { recursive: true });
  await writeFile(join(sslDir, `${slug}.json`), JSON.stringify(doc, null, 2));
}

describe("cfgm-replay CLI", () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "cfgm-replay-"));
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  test("no args → exit(1) + usage", () => {
    const res = cli(projectDir, []);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("Usage:");
  });

  test("--slug with non-existent slug → exit(1) + error message", () => {
    const res = cli(projectDir, ["--slug", "no-such-workflow"]);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("SSL document not found: no-such-workflow");
  });

  test("--list with no SSL files → 'no workflows' + exit(0)", async () => {
    await mkdir(join(projectDir, "memory/concepts/_ssl"), { recursive: true });
    const res = cli(projectDir, ["--list"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("no workflows");
  });

  test("--list with SSL files → slug + skillName output", async () => {
    const doc = makeSSL("my-workflow", {
      scheduling: {
        ...makeSSL("my-workflow").scheduling,
        skillName: "My Workflow",
      },
    });
    await writeSSL(projectDir, "my-workflow", doc);
    const res = cli(projectDir, ["--list"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("my-workflow");
    expect(res.stdout).toContain("My Workflow");
  });

  test("--slug basic run → creates replay plan file at default path", async () => {
    const doc = makeSSL("test-skill");
    await writeSSL(projectDir, "test-skill", doc);
    const res = cli(projectDir, ["--slug", "test-skill"]);
    expect(res.status).toBe(0);
    const outFile = Bun.file(join(projectDir, "memory/_pending/replay/test-skill.replay.md"));
    expect(await outFile.exists()).toBe(true);
  });

  test("--json → parseable JSON with slug, skillName, sceneCount", async () => {
    const doc = makeSSL("json-skill");
    await writeSSL(projectDir, "json-skill", doc);
    const res = cli(projectDir, ["--slug", "json-skill", "--json"]);
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout);
    expect(out.slug).toBe("json-skill");
    expect(out.skillName).toBe("json-skill");
    expect(out.sceneCount).toBe(3);
    expect(out.logicalCount).toBe(3);
    expect(typeof out.outputPath).toBe("string");
  });

  test("--query matches skillName token → selects correct slug", async () => {
    const docA = makeSSL("alpha-flow", {
      scheduling: { ...makeSSL("alpha-flow").scheduling, skillName: "Alpha Flow Runner" },
    });
    const docB = makeSSL("beta-flow", {
      scheduling: { ...makeSSL("beta-flow").scheduling, skillName: "Beta Processor" },
    });
    await writeSSL(projectDir, "alpha-flow", docA);
    await writeSSL(projectDir, "beta-flow", docB);

    const res = cli(projectDir, ["--query", "Alpha Flow"]);
    expect(res.status).toBe(0);
    const outFile = Bun.file(join(projectDir, "memory/_pending/replay/alpha-flow.replay.md"));
    expect(await outFile.exists()).toBe(true);
  });

  test("--query with no match → exit(1)", async () => {
    const doc = makeSSL("some-skill");
    await writeSSL(projectDir, "some-skill", doc);
    const res = cli(projectDir, ["--query", "zzz-nonexistent-xyz"]);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("no matching SSL found for query");
  });

  test("--output <path> → writes to specified path", async () => {
    const doc = makeSSL("path-skill");
    await writeSSL(projectDir, "path-skill", doc);
    const customOut = join(projectDir, "custom/out/plan.md");
    const res = cli(projectDir, ["--slug", "path-skill", "--output", customOut]);
    expect(res.status).toBe(0);
    const outFile = Bun.file(customOut);
    expect(await outFile.exists()).toBe(true);
  });

  test("generated plan contains scene names, logical actions, and success criteria", async () => {
    const doc = makeSSL("full-skill", {
      evidence: [
        {
          id: "full-skill#evidence:0",
          caseLabel: "happy path",
          inputs: { x: 1 },
          outputs: { y: 2 },
          successCriteria: ["output y equals 2", "no errors"],
        },
      ],
    });
    await writeSSL(projectDir, "full-skill", doc);
    const res = cli(projectDir, ["--slug", "full-skill"]);
    expect(res.status).toBe(0);

    const outFile = Bun.file(join(projectDir, "memory/_pending/replay/full-skill.replay.md"));
    const content = await outFile.text();

    // Scene names
    expect(content).toContain("Scene: PREPARE");
    expect(content).toContain("Scene: ACT");
    expect(content).toContain("Scene: VERIFY");

    // Logical action
    expect(content).toContain("[READ]");
    expect(content).toContain("Read memory state");

    // Success criteria
    expect(content).toContain("output y equals 2");
    expect(content).toContain("no errors");
    expect(content).toContain("happy path");
  });
});
