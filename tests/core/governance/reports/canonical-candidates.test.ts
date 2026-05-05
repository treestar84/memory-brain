import { describe, test, expect } from "bun:test";
import {
  CanonicalCandidatesDetector,
  buildKnownSignatures,
} from "../../../../src/core/governance/reports/CanonicalCandidatesDetector";
import type { GovernanceInput } from "../../../../src/core/governance/reports/types";
import { SSL_VERSION, type SSLDocument } from "../../../../src/core/ontology/ssl";

function skill(name: string, logical: SSLDocument["logical"]): SSLDocument {
  return {
    sslVersion: SSL_VERSION, sourceSkillPath: `/s/${name}.md`, sourceSha256: name,
    generatedAt: "2026-05-05T00:00:00Z", generatedBy: "llm",
    scheduling: {
      id: `${name}#scheduling`, skillName: name, skillGoal: "",
      intentSignature: "", intentSignatures: [], triggerPatterns: [],
      expectedInputs: [], expectedOutputs: [], dependencies: [],
      controlFlowFeatures: [],
      ioContract: { inputsRaw: "", outputsRaw: "" }, preconditions: [],
    },
    structural: [], logical, warnings: [],
  };
}

function l(id: string, action: SSLDocument["logical"][0]["action"], resources: SSLDocument["logical"][0]["resources"], opts: Partial<SSLDocument["logical"][0]> = {}): SSLDocument["logical"][0] {
  return { id, action, resources, description: opts.description ?? "x", effects: [], evidenceClaimIds: [], ...opts };
}

function input(skills: SSLDocument[], known?: Set<string>): GovernanceInput {
  return { claims: [], wikiPages: [], skills, knownCanonicalSignatures: known, now: "2026-05-05T00:00:00Z" };
}

describe("CanonicalCandidatesDetector (PR-V3.17c)", () => {
  const detector = new CanonicalCandidatesDetector();

  test("THRESHOLD = 3 — 2회 등장은 미발견", () => {
    const skills = [
      skill("s1", [l("s1#l:1", "READ", ["LOCAL_FS"])]),
      skill("s2", [l("s2#l:1", "READ", ["LOCAL_FS"])]),
    ];
    const r = detector.detect(input(skills));
    expect(r.findings).toEqual([]);
    expect(r.summary).toMatch(/신규 canonical 후보 없음/);
  });

  test("3회 등장은 발견", () => {
    const skills = [
      skill("s1", [l("s1#l:1", "READ", ["LOCAL_FS"])]),
      skill("s2", [l("s2#l:1", "READ", ["LOCAL_FS"])]),
      skill("s3", [l("s3#l:1", "READ", ["LOCAL_FS"])]),
    ];
    const r = detector.detect(input(skills));
    expect(r.findings.length).toBe(1);
    expect(r.findings[0].subject).toBe("READ/LOCAL_FS");
    expect(r.findings[0].message).toMatch(/3 occurrences across 3 skill/);
    expect(r.findings[0].evidence?.length).toBe(3);
  });

  test("knownCanonicalSignatures 에 등록된 패턴은 skip", () => {
    const skills = Array.from({ length: 5 }, (_, i) =>
      skill(`s${i}`, [l(`s${i}#l:1`, "READ", ["LOCAL_FS"])]),
    );
    const known = new Set(["READ/LOCAL_FS"]);
    const r = detector.detect(input(skills, known));
    expect(r.findings).toEqual([]);
  });

  test("이미 actionRef 사용 중인 노드는 후보 분석 skip", () => {
    const skills = [
      skill("s1", [l("s1#l:1", "READ", ["LOCAL_FS"], { actionRef: "READ_LOCAL_FILE" })]),
      skill("s2", [l("s2#l:1", "READ", ["LOCAL_FS"], { actionRef: "READ_LOCAL_FILE" })]),
      skill("s3", [l("s3#l:1", "READ", ["LOCAL_FS"], { actionRef: "READ_LOCAL_FILE" })]),
    ];
    const r = detector.detect(input(skills));
    expect(r.findings).toEqual([]);
  });

  test("resources 순서 무관 — sorted signature 같으면 같은 bucket", () => {
    const skills = [
      skill("s1", [l("s1#l:1", "CALL_TOOL", ["NETWORK", "LOCAL_FS"])]),
      skill("s2", [l("s2#l:1", "CALL_TOOL", ["LOCAL_FS", "NETWORK"])]),
      skill("s3", [l("s3#l:1", "CALL_TOOL", ["NETWORK", "LOCAL_FS"])]),
    ];
    const r = detector.detect(input(skills));
    expect(r.findings.length).toBe(1);
    expect(r.findings[0].subject).toBe("CALL_TOOL/LOCAL_FS,NETWORK");
  });

  test("여러 후보가 있을 때 빈도 내림차순 정렬", () => {
    const skills = [
      ...Array.from({ length: 5 }, (_, i) => skill(`a${i}`, [l(`a${i}#l:1`, "INFER", ["MEMORY"])])),
      ...Array.from({ length: 3 }, (_, i) => skill(`b${i}`, [l(`b${i}#l:1`, "WRITE", ["LOCAL_FS"])])),
    ];
    const r = detector.detect(input(skills));
    expect(r.findings.length).toBe(2);
    expect(r.findings[0].subject).toBe("INFER/MEMORY");
    expect(r.findings[1].subject).toBe("WRITE/LOCAL_FS");
  });

  test("skills 비어있으면 skip", () => {
    const r = detector.detect(input([]));
    expect(r.summary).toMatch(/skip/);
    expect(r.findings).toEqual([]);
  });

  test("buildKnownSignatures helper — canonical defs → Set", () => {
    const defs = [
      { action: "READ", resources: ["LOCAL_FS"] },
      { action: "CALL_TOOL", resources: ["LOCAL_FS", "NETWORK"] },
    ];
    const set = buildKnownSignatures(defs);
    expect(set.has("READ/LOCAL_FS")).toBe(true);
    expect(set.has("CALL_TOOL/LOCAL_FS,NETWORK")).toBe(true);
    expect(set.size).toBe(2);
  });

  test("11 skill 시나리오 (V3.17a 시드 적용 후) — known 7 개로 후보 거의 0", () => {
    // 모든 logical 이 7 시드 중 하나에 매치된다고 가정
    const skills = [
      skill("a", [l("a#l:1", "INFER", ["MEMORY"], { actionRef: "INFER_FROM_MEMORY" })]),
      skill("b", [l("b#l:1", "EMIT", ["MEMORY"], { actionRef: "EMIT_TO_MEMORY" })]),
      skill("c", [l("c#l:1", "READ", ["LOCAL_FS"], { actionRef: "READ_LOCAL_FILE" })]),
    ];
    const known = buildKnownSignatures([
      { action: "INFER", resources: ["MEMORY"] },
      { action: "EMIT", resources: ["MEMORY"] },
      { action: "READ", resources: ["LOCAL_FS"] },
    ]);
    const r = detector.detect(input(skills, known));
    expect(r.findings).toEqual([]);
  });

  test("detector id stable", () => {
    expect(detector.id).toBe("canonical-candidates");
  });
});
