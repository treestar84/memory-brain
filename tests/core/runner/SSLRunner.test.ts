import { describe, test, expect } from "bun:test";
import { SSLRunner } from "../../../src/core/runner/SSLRunner";
import type { SSLDocument } from "../../../src/core/ontology/ssl";

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
