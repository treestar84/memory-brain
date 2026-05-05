import { describe, test, expect } from "bun:test";
import {
  validateSSL,
  SSL_VERSION,
  type DecisionNode,
  type EvidenceNode,
  type InteractionNode,
  type ProtocolNode,
  type SSLDocument,
} from "../../../src/core/ontology/ssl";

function baseDoc(overrides: Partial<SSLDocument> = {}): SSLDocument {
  return {
    sslVersion: SSL_VERSION,
    sourceSkillPath: "/skills/x.md",
    sourceSha256: "x",
    generatedAt: "2026-05-05T00:00:00Z",
    generatedBy: "llm",
    scheduling: {
      id: "x#scheduling",
      skillName: "x",
      skillGoal: "",
      intentSignature: "",
      intentSignatures: [],
      triggerPatterns: [],
      expectedInputs: [],
      expectedOutputs: [],
      dependencies: [],
      controlFlowFeatures: [],
      ioContract: { inputsRaw: "", outputsRaw: "" },
      preconditions: [],
    },
    structural: [{
      id: "x#scene:ACT:1", scene: "ACT", sceneGoal: "act", summary: "Act",
      containsLogicalIds: ["x#l:1"], transitionsTo: [],
    }],
    logical: [{
      id: "x#l:1", action: "READ", description: "x",
      resources: ["LOCAL_FS"], effects: [], evidenceClaimIds: [],
    }],
    warnings: [],
    ...overrides,
  };
}

describe("SSL v0.3.0 — 4 신규 노드 (PR-V3.17b)", () => {
  test("SSL_VERSION = 0.3.0", () => {
    expect(SSL_VERSION).toBe("0.3.0");
  });

  test("4 노드 모두 빈 배열 default — back-compat", () => {
    const doc = baseDoc();
    expect(validateSSL(doc)).toEqual([]);
  });

  test("DecisionNode — branches non-empty 강제", () => {
    const decision: DecisionNode = {
      id: "x#decision:1",
      question: "user provided config?",
      branches: [],
    };
    const doc = baseDoc({ decisions: [decision] });
    const errors = validateSSL(doc);
    expect(errors.some((e) => /branches.*non-empty/.test(e))).toBe(true);
  });

  test("DecisionNode — valid 통과 + scopeRef dangling 감지", () => {
    const valid: DecisionNode = {
      id: "x#decision:1",
      question: "user provided config?",
      branches: [{ when: "yes", then: "load it" }, { when: "no", then: "use default" }],
      scopeRef: "x#scene:ACT:1",
    };
    expect(validateSSL(baseDoc({ decisions: [valid] }))).toEqual([]);

    const dangling: DecisionNode = { ...valid, scopeRef: "x#scene:GHOST:99" };
    expect(validateSSL(baseDoc({ decisions: [dangling] })).some((e) => /dangling scopeRef/.test(e))).toBe(true);
  });

  test("InteractionNode — expectedResponseType enum 강제", () => {
    const bad: InteractionNode = {
      id: "x#interaction:1",
      prompt: "Continue?",
      expectedResponseType: "BOGUS" as never,
      variables: [],
    };
    expect(validateSSL(baseDoc({ interactions: [bad] })).some((e) => /invalid expectedResponseType/.test(e))).toBe(true);
  });

  test("InteractionNode — selection 은 options[] 의무", () => {
    const noOpts: InteractionNode = {
      id: "x#interaction:1",
      prompt: "Pick one",
      expectedResponseType: "selection",
      variables: [],
    };
    expect(validateSSL(baseDoc({ interactions: [noOpts] })).some((e) => /selection requires options/.test(e))).toBe(true);

    const withOpts: InteractionNode = { ...noOpts, options: ["A", "B"] };
    expect(validateSSL(baseDoc({ interactions: [withOpts] }))).toEqual([]);
  });

  test("EvidenceNode — successCriteria 배열 강제", () => {
    const bad = {
      id: "x#evidence:1",
      caseLabel: "case1",
      inputs: { a: 1 },
      outputs: { b: 2 },
      successCriteria: "not array" as unknown as string[],
    };
    expect(validateSSL(baseDoc({ evidence: [bad as EvidenceNode] })).some((e) => /successCriteria/.test(e))).toBe(true);
  });

  test("EvidenceNode — valid 통과", () => {
    const ev: EvidenceNode = {
      id: "x#evidence:1",
      caseLabel: "config-load happy path",
      inputs: { configPath: "/etc/foo.yaml" },
      outputs: { user: "alice" },
      successCriteria: ["config has 'user' key", "no exception thrown"],
    };
    expect(validateSSL(baseDoc({ evidence: [ev] }))).toEqual([]);
  });

  test("ProtocolNode — delegateTo 의무", () => {
    const bad = {
      id: "x#protocol:1",
      delegateTo: "",
      whenCondition: "always",
      inputsForward: [],
      outputsExpected: [],
    };
    expect(validateSSL(baseDoc({ protocols: [bad as ProtocolNode] })).some((e) => /delegateTo/.test(e))).toBe(true);
  });

  test("ProtocolNode — valid 통과 + scopeRef dangling 감지", () => {
    const valid: ProtocolNode = {
      id: "x#protocol:1",
      delegateTo: "bmad-help",
      whenCondition: "user asks for help",
      inputsForward: ["topic"],
      outputsExpected: ["recommendation"],
      scopeRef: "x#l:1",
    };
    expect(validateSSL(baseDoc({ protocols: [valid] }))).toEqual([]);

    const dangling: ProtocolNode = { ...valid, scopeRef: "x#l:99" };
    expect(validateSSL(baseDoc({ protocols: [dangling] })).some((e) => /dangling scopeRef/.test(e))).toBe(true);
  });

  test("4 노드 모두 채운 full SSL — 통과", () => {
    const doc = baseDoc({
      decisions: [{
        id: "x#decision:1", question: "ok?",
        branches: [{ when: "yes", then: "next" }],
        scopeRef: "x#scene:ACT:1",
      }],
      interactions: [{
        id: "x#interaction:1", prompt: "Confirm?",
        expectedResponseType: "yes-no", variables: [],
      }],
      evidence: [{
        id: "x#evidence:1", caseLabel: "happy",
        inputs: {}, outputs: {}, successCriteria: ["passed"],
      }],
      protocols: [{
        id: "x#protocol:1", delegateTo: "bmad-help",
        whenCondition: "always", inputsForward: [], outputsExpected: [],
      }],
    });
    expect(validateSSL(doc)).toEqual([]);
  });

  test("SSLDocument 0.2.0 거부 (sslVersion mismatch)", () => {
    const doc = baseDoc({ sslVersion: "0.2.0" as never });
    expect(validateSSL(doc).some((e) => /sslVersion mismatch/.test(e))).toBe(true);
  });
});
