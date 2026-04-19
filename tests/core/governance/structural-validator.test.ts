import { describe, test, expect, beforeEach } from "bun:test";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";
import { StructuralValidator } from "../../../src/core/governance/StructuralValidator";
import { GOVERNANCE_CONFIG } from "../../../src/core/governance/config";
import type { FlowBlock, FlowGraph } from "../../../src/core/flow/types";
import type { ShaclLiteSchema } from "../../../src/core/governance/types";
import { stringify } from "yaml";

const BASE_TIME = "2026-04-19T10:00:00.000Z";

function mkBlock(overrides: Partial<FlowBlock> = {}): FlowBlock {
  return {
    blockId: "b1",
    problemId: "prob-1",
    type: "Action",
    status: "confirmed",
    label: "test",
    confidence: 0.9,
    supportedBy: [],
    relations: [],
    createdAt: BASE_TIME,
    lastConfirmedAt: BASE_TIME,
    staleAfter: null,
    supersededBy: null,
    bundleId: "bnd-1",
    ...overrides,
  };
}

function mkGraph(blocks: FlowBlock[], problemId = "prob-1"): FlowGraph {
  return {
    problemId,
    blocks,
    cueCardMeta: { lastSyntheticAt: null, bodyHash: null, bodyBytes: 0, stale: false },
  };
}

describe("StructuralValidator", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let validator: StructuralValidator;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date(BASE_TIME));
    validator = new StructuralValidator(storage, clock);
  });

  test("위반 없는 그래프 → isValid=true, violations 없음", async () => {
    const graph = mkGraph([mkBlock({ blockId: "b1", type: "Action" })]);
    const report = await validator.validate("prob-1", graph);
    expect(report.isValid).toBe(true);
    expect(report.violations).toHaveLength(0);
  });

  test("orphan-question: gapBlockId가 없는 Question → error violation", async () => {
    const graph = mkGraph([
      mkBlock({ blockId: "q1", type: "Question", gapBlockId: "gap-nonexistent" }),
    ]);
    const report = await validator.validate("prob-1", graph);
    expect(report.isValid).toBe(false);
    const v = report.violations.find((v: { ruleId: string }) => v.ruleId ==="orphan-question");
    expect(v).toBeDefined();
    expect(v!.severity).toBe("error");
    expect(v!.blockId).toBe("q1");
  });

  test("orphan-question: gapBlockId가 존재하는 Gap을 참조 → 위반 없음", async () => {
    const graph = mkGraph([
      mkBlock({ blockId: "g1", type: "Gap" }),
      mkBlock({ blockId: "q1", type: "Question", gapBlockId: "g1" }),
    ]);
    const report = await validator.validate("prob-1", graph);
    expect(report.violations.filter((v: { ruleId: string }) => v.ruleId === "orphan-question")).toHaveLength(0);
  });

  test("broken-supersede-chain: supersededBy가 존재하지 않는 blockId → error violation", async () => {
    const graph = mkGraph([
      mkBlock({ blockId: "b1", status: "superseded", supersededBy: "nonexistent-id" }),
    ]);
    const report = await validator.validate("prob-1", graph);
    expect(report.isValid).toBe(false);
    const v = report.violations.find((v: { ruleId: string }) => v.ruleId ==="broken-supersede-chain");
    expect(v).toBeDefined();
    expect(v!.blockId).toBe("b1");
  });

  test("broken-supersede-chain: supersededBy가 decay sentinel → 위반 없음", async () => {
    const graph = mkGraph([
      mkBlock({ blockId: "b1", status: "superseded", supersededBy: GOVERNANCE_CONFIG.DECAY_REASON }),
    ]);
    const report = await validator.validate("prob-1", graph);
    expect(report.violations.filter((v: { ruleId: string }) => v.ruleId === "broken-supersede-chain")).toHaveLength(0);
  });

  test("broken-supersede-chain: supersededBy가 null → 위반 없음", async () => {
    const graph = mkGraph([
      mkBlock({ blockId: "b1", status: "confirmed", supersededBy: null }),
    ]);
    const report = await validator.validate("prob-1", graph);
    expect(report.violations.filter((v: { ruleId: string }) => v.ruleId === "broken-supersede-chain")).toHaveLength(0);
  });

  test("provenance-check: Cause.supportedBy 빈 배열 → warning violation", async () => {
    const graph = mkGraph([
      mkBlock({ blockId: "c1", type: "Cause", supportedBy: [] }),
    ]);
    const report = await validator.validate("prob-1", graph);
    const v = report.violations.find((v: { ruleId: string }) => v.ruleId ==="cause-needs-provenance");
    expect(v).toBeDefined();
    expect(v!.severity).toBe("warning");
    expect(report.isValid).toBe(true); // warning만 있으면 isValid=true
  });

  test("provenance-check: Cause.supportedBy 있음 → 위반 없음", async () => {
    const graph = mkGraph([
      mkBlock({ blockId: "c1", type: "Cause", supportedBy: ["e1"] }),
    ]);
    const report = await validator.validate("prob-1", graph);
    expect(report.violations.filter((v: { ruleId: string }) => v.ruleId === "cause-needs-provenance")).toHaveLength(0);
  });

  test("report가 storage에 저장됨", async () => {
    const graph = mkGraph([mkBlock()]);
    await validator.validate("prob-1", graph);
    const stored = await storage.readJson<any>(GOVERNANCE_CONFIG.VALIDATION_REPORT_PATH);
    expect(stored).not.toBeNull();
    expect(stored.problemId).toBe("prob-1");
  });

  test("커스텀 shacl-lite.yaml을 storage에서 로드하면 해당 규칙 사용", async () => {
    const customSchema: ShaclLiteSchema = {
      version: "shacl-lite@1.0.0",
      rules: [
        {
          id: "custom-rule",
          type: "required-block-type",
          blockType: "Problem",
          minCount: 1,
          severity: "error",
          message: "Must have Problem block",
        },
      ],
    };
    await storage.writeRaw("governance/shacl-lite.yaml", stringify(customSchema));

    const graph = mkGraph([mkBlock({ blockId: "b1", type: "Action" })]);
    const report = await validator.validate("prob-1", graph);
    expect(report.violations.some((v: { ruleId: string }) => v.ruleId === "custom-rule")).toBe(true);
  });

  test("여러 violations — error와 warning 혼재 → isValid=false (error 있으면 false)", async () => {
    const graph = mkGraph([
      mkBlock({ blockId: "q1", type: "Question", gapBlockId: "nonexistent" }), // error
      mkBlock({ blockId: "c1", type: "Cause", supportedBy: [] }), // warning
    ]);
    const report = await validator.validate("prob-1", graph);
    expect(report.isValid).toBe(false);
    expect(report.violations.length).toBeGreaterThanOrEqual(2);
  });
});
