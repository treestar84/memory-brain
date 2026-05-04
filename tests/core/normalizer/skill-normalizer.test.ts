import { describe, test, expect } from "bun:test";
import { SkillNormalizer } from "../../../src/core/normalizer/SkillNormalizer";
import { validateSSL, SSL_VERSION, type LogicalNode, type StructuralNode } from "../../../src/core/ontology/ssl";

const SAMPLE_SKILL = `---
name: example-debug
description: Debug failing tests. Use when the user reports test failures or build errors.
---

# Example Debug Skill

## Prepare

Run \`Bash\` to check git status before starting.

## Acquire

Use Read on the failing test file, then Grep for the error message.

## Reason

Analyze the stack trace and form a hypothesis.

## Act

Use Edit to apply a fix to the source file.

## Verify

Run Bash to re-execute the test and confirm pass.
`;

function makeInput(source = SAMPLE_SKILL) {
  return {
    skillPath: "/skills/example-debug.md",
    source,
    sourceSha256: "deadbeef",
    generatedAt: "2026-05-05T00:00:00Z",
  };
}

describe("SkillNormalizer (PR-V3.12 1차, heuristic)", () => {
  const normalizer = new SkillNormalizer();

  test("frontmatter → Scheduling node", () => {
    const doc = normalizer.normalize(makeInput());
    expect(doc.sslVersion).toBe(SSL_VERSION);
    expect(doc.generatedBy).toBe("heuristic");
    expect(doc.scheduling.skillName).toBe("example-debug");
    expect(doc.scheduling.intentSignature).toContain("Debug failing tests");
    expect(doc.scheduling.triggerPatterns.length).toBeGreaterThan(0);
  });

  test("H2 headings → Structural scenes (linear transitions)", () => {
    const doc = normalizer.normalize(makeInput());
    const scenes = doc.structural.map((s: StructuralNode) => s.scene);
    expect(scenes).toContain("PREPARE");
    expect(scenes).toContain("ACQUIRE");
    expect(scenes).toContain("REASON");
    expect(scenes).toContain("ACT");
    expect(scenes).toContain("VERIFY");

    // linear transitions: 앞 → 뒤로 연결
    for (let i = 0; i < doc.structural.length - 1; i++) {
      expect(doc.structural[i].transitionsTo).toContain(doc.structural[i + 1].id);
    }
  });

  test("tool mentions → Logical actions w/ resource scopes", () => {
    const doc = normalizer.normalize(makeInput());
    const actions = doc.logical.map((l: LogicalNode) => l.action);
    expect(actions).toContain("READ");
    expect(actions).toContain("WRITE");
    expect(actions).toContain("CALL_TOOL"); // Bash

    const bashLogical = doc.logical.find((l: LogicalNode) => /Bash/.test(l.description));
    expect(bashLogical?.resources).toContain("LOCAL_FS");
  });

  test("Structural→Logical containment links resolve", () => {
    const doc = normalizer.normalize(makeInput());
    const logicalIds = new Set(doc.logical.map((l: LogicalNode) => l.id));
    for (const s of doc.structural) {
      for (const lid of s.containsLogicalIds) {
        expect(logicalIds.has(lid)).toBe(true);
      }
    }
  });

  test("validateSSL passes on heuristic output", () => {
    const doc = normalizer.normalize(makeInput());
    expect(validateSSL(doc)).toEqual([]);
  });

  test("missing frontmatter → warning, not crash", () => {
    const doc = normalizer.normalize(makeInput("# Just a heading\n\n## Verify\nRun Bash.\n"));
    expect(doc.warnings.some((w: string) => /frontmatter/.test(w))).toBe(true);
    expect(doc.scheduling.skillName).toBe("example-debug"); // slug from path fallback
    expect(validateSSL(doc)).toEqual([]);
  });

  test("body without recognizable scene headings → warning", () => {
    const src = `---
name: empty
description: Nothing useful.
---
# Title
some prose without recognizable headings.
`;
    const doc = normalizer.normalize(makeInput(src));
    expect(doc.warnings.some((w: string) => /no scenes/.test(w))).toBe(true);
  });

  test("v0.2.0 풍부화 schema (PR-V3.12.1) — 신규 필드가 채워진다", () => {
    const src = `---
name: rich-skill
description: Collect URLs. Use when the user wants fresh URLs. Use when the user runs retry.
---
## Inputs
- \`keyword\`
- \`language\`

## Outputs
- \`urls\`

## Acquire
Use Bash to fetch from \`search_api\` over HTTP. Retry with backoff on failure.

## Act
Use Write to persist to \`supabase\` and schedule via \`qstash\`.
`;
    const doc = normalizer.normalize(makeInput(src));
    expect(doc.sslVersion).toBe("0.2.0");

    // Scheduling
    expect(doc.scheduling.intentSignatures.length).toBeGreaterThan(0);
    expect(doc.scheduling.skillGoal.length).toBeGreaterThan(0);
    expect(doc.scheduling.expectedInputs).toContain("keyword");
    expect(doc.scheduling.expectedOutputs).toContain("urls");
    expect(doc.scheduling.dependencies).toContain("search_api");
    expect(doc.scheduling.dependencies).toContain("supabase");
    expect(doc.scheduling.controlFlowFeatures).toContain("network_access");
    expect(doc.scheduling.controlFlowFeatures).toContain("scheduled_retry");

    // Structural — sceneGoal 존재
    expect(doc.structural.every((s: { sceneGoal: string }) => s.sceneGoal.length > 0)).toBe(true);

    // Logical — effects 배열 + resourceTarget 존재
    expect(doc.logical.length).toBeGreaterThan(0);
    expect(doc.logical.every((l: { effects: string[] }) => Array.isArray(l.effects))).toBe(true);
    expect(doc.logical.some((l: { resourceTarget?: string }) => typeof l.resourceTarget === "string")).toBe(true);
  });
});
