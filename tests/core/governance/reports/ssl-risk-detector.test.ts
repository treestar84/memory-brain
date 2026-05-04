import { describe, test, expect } from "bun:test";
import { SSLRiskDetector } from "../../../../src/core/governance/reports/SSLRiskDetector";
import type { GovernanceInput } from "../../../../src/core/governance/reports/types";
import type { SSLDocument } from "../../../../src/core/ontology/ssl";
import { SSL_VERSION } from "../../../../src/core/ontology/ssl";

function baseInput(skills: SSLDocument[]): GovernanceInput {
  return { claims: [], wikiPages: [], skills, now: "2026-05-05T00:00:00Z" };
}

function makeSkill(overrides: Partial<SSLDocument> = {}): SSLDocument {
  return {
    sslVersion: SSL_VERSION,
    sourceSkillPath: "/skills/x.md",
    sourceSha256: "x",
    generatedAt: "2026-05-05T00:00:00Z",
    generatedBy: "heuristic",
    scheduling: {
      id: "x#scheduling",
      skillName: "x",
      intentSignature: "",
      triggerPatterns: [],
      ioContract: { inputsRaw: "", outputsRaw: "" },
      preconditions: [],
    },
    structural: [],
    logical: [],
    warnings: [],
    ...overrides,
  };
}

describe("SSLRiskDetector (PR-V3.15)", () => {
  const detector = new SSLRiskDetector();

  test("CREDENTIALS scope → critical finding", () => {
    const skill = makeSkill({
      scheduling: { ...makeSkill().scheduling, skillName: "auth-rotate" },
      structural: [{ id: "x#scene:ACT:1", scene: "ACT", summary: "Rotate", containsLogicalIds: ["x#l:1"], transitionsTo: [] }],
      logical: [{ id: "x#l:1", action: "READ", description: "load token", resources: ["CREDENTIALS"], evidenceClaimIds: [] }],
    });
    const r = detector.detect(baseInput([skill]));
    const crit = r.findings.filter((f) => f.severity === "critical");
    expect(crit.length).toBe(1);
    expect(crit[0].message).toMatch(/CREDENTIALS/);
  });

  test("WRITE × NETWORK → warning (data exfil 가능성)", () => {
    const skill = makeSkill({
      structural: [{ id: "x#scene:ACT:1", scene: "ACT", summary: "Send", containsLogicalIds: ["x#l:1"], transitionsTo: [] }],
      logical: [{ id: "x#l:1", action: "WRITE", description: "POST", resources: ["NETWORK"], evidenceClaimIds: [] }],
    });
    const r = detector.detect(baseInput([skill]));
    expect(r.findings.some((f) => f.severity === "warning" && /WRITE × NETWORK/.test(f.message))).toBe(true);
  });

  test("WRITE in non-ACT scene → warning (mutation outside intended phase)", () => {
    const skill = makeSkill({
      structural: [{ id: "x#scene:ACQUIRE:1", scene: "ACQUIRE", summary: "Read+Write", containsLogicalIds: ["x#l:1"], transitionsTo: [] }],
      logical: [{ id: "x#l:1", action: "WRITE", description: "log file", resources: ["LOCAL_FS"], evidenceClaimIds: [] }],
    });
    const r = detector.detect(baseInput([skill]));
    expect(r.findings.some((f) => f.severity === "warning" && /Scene ACQUIRE/.test(f.message))).toBe(true);
  });

  test("WRITE in ACT scene → no scene warning", () => {
    const skill = makeSkill({
      structural: [{ id: "x#scene:ACT:1", scene: "ACT", summary: "Apply", containsLogicalIds: ["x#l:1"], transitionsTo: [] }],
      logical: [{ id: "x#l:1", action: "WRITE", description: "edit file", resources: ["LOCAL_FS"], evidenceClaimIds: [] }],
    });
    const r = detector.detect(baseInput([skill]));
    expect(r.findings.filter((f) => /Scene/.test(f.message))).toEqual([]);
  });

  test("3+ distinct resource scopes → info finding", () => {
    const skill = makeSkill({
      structural: [{ id: "x#scene:ACT:1", scene: "ACT", summary: "Multi", containsLogicalIds: ["x#l:1", "x#l:2", "x#l:3"], transitionsTo: [] }],
      logical: [
        { id: "x#l:1", action: "READ", description: "fs", resources: ["LOCAL_FS"], evidenceClaimIds: [] },
        { id: "x#l:2", action: "CALL_TOOL", description: "net", resources: ["NETWORK"], evidenceClaimIds: [] },
        { id: "x#l:3", action: "EMIT", description: "mem", resources: ["MEMORY"], evidenceClaimIds: [] },
      ],
    });
    const r = detector.detect(baseInput([skill]));
    expect(r.findings.some((f) => f.severity === "info" && /광범위 권한/.test(f.message))).toBe(true);
  });

  test("clean skill → empty findings", () => {
    const skill = makeSkill({
      structural: [{ id: "x#scene:ACQUIRE:1", scene: "ACQUIRE", summary: "Read", containsLogicalIds: ["x#l:1"], transitionsTo: [] }],
      logical: [{ id: "x#l:1", action: "READ", description: "config", resources: ["LOCAL_FS"], evidenceClaimIds: [] }],
    });
    const r = detector.detect(baseInput([skill]));
    expect(r.findings).toEqual([]);
    expect(r.summary).toMatch(/risk-free/);
  });

  test("no skills input → skip summary, no findings", () => {
    const r = detector.detect({ claims: [], wikiPages: [], now: "2026-05-05T00:00:00Z" });
    expect(r.findings).toEqual([]);
    expect(r.summary).toMatch(/skip/);
  });

  test("detector id stable", () => {
    expect(detector.id).toBe("ssl-risk");
  });
});
