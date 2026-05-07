import { describe, test, expect } from "bun:test";
import { KGProjector } from "../../../src/core/search/KGProjector";
import { SSL_VERSION } from "../../../src/core/ontology/ssl";
import type { SSLDocument } from "../../../src/core/ontology/ssl";

// ─── fixture helper ────────────────────────────────────────────────────────────

function makeSSL(slug: string, overrides: Partial<SSLDocument> = {}): SSLDocument {
  const base: SSLDocument = {
    sslVersion: SSL_VERSION,
    sourceSkillPath: `skills/${slug}/SKILL.md`,
    sourceSha256: "abc123",
    generatedAt: "2026-05-01T00:00:00Z",
    generatedBy: "heuristic",
    scheduling: {
      id: `${slug}#scheduling`,
      skillName: slug,
      skillGoal: `${slug} goal`,
      intentSignature: `run ${slug}`,
      intentSignatures: [`run ${slug}`],
      triggerPatterns: [],
      expectedInputs: [],
      expectedOutputs: [],
      dependencies: [],
      controlFlowFeatures: [],
      ioContract: { inputsRaw: "", outputsRaw: "" },
      preconditions: [],
    },
    structural: [
      {
        id: `${slug}#scene:PREPARE:0`,
        scene: "PREPARE",
        sceneGoal: "prepare resources",
        summary: "Preparation phase",
        containsLogicalIds: [`${slug}#logical:0`],
        transitionsTo: [`${slug}#scene:ACT:1`],
      },
      {
        id: `${slug}#scene:ACT:1`,
        scene: "ACT",
        sceneGoal: "execute action",
        summary: "Action phase",
        containsLogicalIds: [`${slug}#logical:1`],
        transitionsTo: [],
      },
    ],
    logical: [
      {
        id: `${slug}#logical:0`,
        action: "READ",
        description: "read input",
        resources: ["LOCAL_FS"],
        effects: [],
        evidenceClaimIds: [],
      },
      {
        id: `${slug}#logical:1`,
        action: "WRITE",
        description: "write output",
        resources: ["LOCAL_FS"],
        effects: [],
        evidenceClaimIds: [],
      },
    ],
    decisions: [],
    interactions: [],
    evidence: [],
    protocols: [],
    warnings: [],
    ...overrides,
  };
  return base;
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe("KGProjector", () => {
  const projector = new KGProjector();

  test("1. scheduling 노드 추출", () => {
    const doc = makeSSL("my-skill");
    const { nodes } = projector.projectDocument(doc);
    const sched = nodes.find((n) => n.nodeType === "scheduling");
    expect(sched).toBeDefined();
    expect(sched!.nodeId).toBe("my-skill#scheduling");
    expect(sched!.skillSlug).toBe("my-skill");
    expect(sched!.label).toBe("my-skill");
  });

  test("2. structural 노드 추출 (scene 필드 포함)", () => {
    const doc = makeSSL("sk");
    const { nodes } = projector.projectDocument(doc);
    const structural = nodes.filter((n) => n.nodeType === "structural");
    expect(structural).toHaveLength(2);
    expect(structural[0].scene).toBe("PREPARE");
    expect(structural[1].scene).toBe("ACT");
    expect(structural[0].nodeId).toBe("sk#scene:PREPARE:0");
  });

  test("3. logical 노드 추출 (action 필드 포함)", () => {
    const doc = makeSSL("sk");
    const { nodes } = projector.projectDocument(doc);
    const logical = nodes.filter((n) => n.nodeType === "logical");
    expect(logical).toHaveLength(2);
    expect(logical[0].action).toBe("READ");
    expect(logical[1].action).toBe("WRITE");
  });

  test("4. CONTAINS 엣지 추출", () => {
    const doc = makeSSL("sk");
    const { edges } = projector.projectDocument(doc);
    const contains = edges.filter((e) => e.relation === "CONTAINS");
    expect(contains).toHaveLength(2);
    expect(contains[0].fromId).toBe("sk#scene:PREPARE:0");
    expect(contains[0].toId).toBe("sk#logical:0");
    expect(contains[0].resolved).toBe(true);
  });

  test("5. TRANSITIONS_TO 엣지 추출", () => {
    const doc = makeSSL("sk");
    const { edges } = projector.projectDocument(doc);
    const transitions = edges.filter((e) => e.relation === "TRANSITIONS_TO");
    expect(transitions).toHaveLength(1);
    expect(transitions[0].fromId).toBe("sk#scene:PREPARE:0");
    expect(transitions[0].toId).toBe("sk#scene:ACT:1");
  });

  test("6. INSTANTIATES 엣지 추출 (actionRef가 있을 때)", () => {
    const doc = makeSSL("sk", {
      logical: [
        {
          id: "sk#logical:0",
          action: "READ",
          description: "read",
          resources: ["LOCAL_FS"],
          actionRef: "read-local-file",
          effects: [],
          evidenceClaimIds: [],
        },
      ],
      structural: [
        {
          id: "sk#scene:PREPARE:0",
          scene: "PREPARE",
          sceneGoal: "prep",
          summary: "prep",
          containsLogicalIds: ["sk#logical:0"],
          transitionsTo: [],
        },
      ],
    });
    const { nodes, edges } = projector.projectDocument(doc);
    const instantiates = edges.filter((e) => e.relation === "INSTANTIATES");
    expect(instantiates).toHaveLength(1);
    expect(instantiates[0].toId).toBe("canonical_action:read-local-file");
    const canonNode = nodes.find((n) => n.nodeType === "canonical_action");
    expect(canonNode).toBeDefined();
    expect(canonNode!.nodeId).toBe("canonical_action:read-local-file");
  });

  test("7. DELEGATES_TO 엣지 + resolveCrossSkill: resolved=true (target slug 있음)", () => {
    const docA = makeSSL("skill-a", {
      protocols: [
        {
          id: "skill-a#protocol:0",
          delegateTo: "skill-b",
          whenCondition: "when needed",
          inputsForward: [],
          outputsExpected: [],
        },
      ],
    });
    const docB = makeSSL("skill-b");

    const { nodes: nodesA, edges: edgesA } = projector.projectDocument(docA);
    const { nodes: nodesB, edges: edgesB } = projector.projectDocument(docB);

    const allNodes = [...nodesA, ...nodesB];
    const allEdges = [...edgesA, ...edgesB];

    const nodeIndex = new Set(allNodes.map((n) => n.nodeId));
    const slugIndex = new Set(["skill-a", "skill-b"]);
    const resolved = projector.resolveCrossSkill(allEdges, nodeIndex, slugIndex);

    const delegatesEdge = resolved.find((e) => e.relation === "DELEGATES_TO");
    expect(delegatesEdge).toBeDefined();
    expect(delegatesEdge!.resolved).toBe(true);
    expect(delegatesEdge!.toSkill).toBe("skill-b");
    expect(delegatesEdge!.toId).toBe("skill-b#scheduling");
  });

  test("8. DELEGATES_TO dangling: resolved=false (target slug 없음)", () => {
    const docA = makeSSL("skill-a", {
      protocols: [
        {
          id: "skill-a#protocol:0",
          delegateTo: "unknown-skill",
          whenCondition: "always",
          inputsForward: [],
          outputsExpected: [],
        },
      ],
    });

    const { nodes, edges } = projector.projectDocument(docA);
    const nodeIndex = new Set(nodes.map((n) => n.nodeId));
    const slugIndex = new Set(["skill-a"]);
    const resolved = projector.resolveCrossSkill(edges, nodeIndex, slugIndex);

    const delegatesEdge = resolved.find((e) => e.relation === "DELEGATES_TO");
    expect(delegatesEdge).toBeDefined();
    expect(delegatesEdge!.resolved).toBe(false);
    expect(delegatesEdge!.toSkill).toBeNull();
  });

  test("9. SCOPED_TO 엣지 (decision.scopeRef 있을 때)", () => {
    const doc = makeSSL("sk", {
      decisions: [
        {
          id: "sk#decision:0",
          question: "which path?",
          branches: [{ when: "always", then: "do it" }],
          scopeRef: "sk#scene:PREPARE:0",
        },
      ],
    });
    const { edges } = projector.projectDocument(doc);
    const scopedTo = edges.filter((e) => e.relation === "SCOPED_TO");
    expect(scopedTo).toHaveLength(1);
    expect(scopedTo[0].fromId).toBe("sk#decision:0");
    expect(scopedTo[0].toId).toBe("sk#scene:PREPARE:0");
    expect(scopedTo[0].resolved).toBe(true);
  });

  test("10. 전체 rebuild 통합: SSLDocument → 노드/엣지 수 확인", () => {
    const doc = makeSSL("full-skill", {
      logical: [
        {
          id: "full-skill#logical:0",
          action: "READ",
          description: "read",
          resources: ["LOCAL_FS"],
          actionRef: "read-local",
          effects: [],
          evidenceClaimIds: ["cl-001"],
        },
      ],
      structural: [
        {
          id: "full-skill#scene:PREPARE:0",
          scene: "PREPARE",
          sceneGoal: "prep",
          summary: "prep",
          containsLogicalIds: ["full-skill#logical:0"],
          transitionsTo: [],
        },
      ],
      decisions: [
        {
          id: "full-skill#decision:0",
          question: "ok?",
          branches: [{ when: "yes", then: "proceed" }],
          scopeRef: "full-skill#scene:PREPARE:0",
        },
      ],
      protocols: [
        {
          id: "full-skill#protocol:0",
          delegateTo: "other-skill",
          whenCondition: "if needed",
          inputsForward: [],
          outputsExpected: [],
        },
      ],
    });

    const { nodes, edges } = projector.projectDocument(doc);

    // scheduling(1) + structural(1) + logical(1) + canonical_action(1) + decision(1) + protocol(1)
    expect(nodes.length).toBeGreaterThanOrEqual(6);

    // CONTAINS(1) + INSTANTIATES(1) + REFERENCES_EVIDENCE(1) + SCOPED_TO(1) + DELEGATES_TO(1)
    expect(edges.length).toBeGreaterThanOrEqual(5);

    // resolveCrossSkill: unknown slug → dangling
    const nodeIndex = new Set(nodes.map((n) => n.nodeId));
    const slugIndex = new Set(["full-skill"]);
    const resolved = projector.resolveCrossSkill(edges, nodeIndex, slugIndex);
    const dangling = resolved.filter((e) => !e.resolved);
    expect(dangling.length).toBeGreaterThanOrEqual(1);
  });
});
