import { parse } from "yaml";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import type { FlowGraph } from "../flow/types";
import type {
  ShaclLiteSchema,
  ShaclRule,
  ValidationReport,
  ValidationViolation,
} from "./types";
import { GOVERNANCE_CONFIG } from "./config";

const SHACL_STORAGE_PATH = "governance/shacl-lite.yaml";
const REPORT_VERSION = "validation-report@1.0.0";

// sentinel値 — supersededBy에 허용되는 비-blockId 값들
const SUPERSEDE_SENTINELS: Set<string> = new Set([GOVERNANCE_CONFIG.DECAY_REASON]);

function loadBundledSchema(): ShaclLiteSchema {
  const dir = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(join(dir, "assets/shacl-lite.yaml"), "utf-8");
  return parse(raw) as ShaclLiteSchema;
}

function runRule(rule: ShaclRule, graph: FlowGraph): ValidationViolation[] {
  const violations: ValidationViolation[] = [];
  const blockIds = new Set(graph.blocks.map((b) => b.blockId));

  switch (rule.type) {
    case "required-block-type": {
      const count = graph.blocks.filter(
        (b) => b.type === rule.blockType && b.status === "confirmed",
      ).length;
      if (count < rule.minCount) {
        violations.push({
          ruleId: rule.id,
          severity: rule.severity,
          message: `${rule.message} (found ${count}, required ${rule.minCount})`,
        });
      }
      break;
    }

    case "orphan-check": {
      for (const block of graph.blocks) {
        if (block.type !== rule.blockType) continue;
        if (block.status !== "confirmed") continue;
        const refId = block[rule.field];
        if (!refId || !blockIds.has(refId)) {
          violations.push({
            ruleId: rule.id,
            severity: rule.severity,
            blockId: block.blockId,
            message: rule.message,
          });
        }
      }
      break;
    }

    case "supersede-chain": {
      for (const block of graph.blocks) {
        if (!block.supersededBy) continue;
        if (SUPERSEDE_SENTINELS.has(block.supersededBy)) continue;
        if (blockIds.has(block.supersededBy)) continue;
        violations.push({
          ruleId: rule.id,
          severity: rule.severity,
          blockId: block.blockId,
          message: rule.message,
        });
      }
      break;
    }

    case "provenance-check": {
      for (const block of graph.blocks) {
        if (block.type !== rule.blockType) continue;
        if (block.status !== "confirmed") continue;
        if (!block.supportedBy || block.supportedBy.length === 0) {
          violations.push({
            ruleId: rule.id,
            severity: rule.severity,
            blockId: block.blockId,
            message: rule.message,
          });
        }
      }
      break;
    }
  }

  return violations;
}

export class StructuralValidator {
  constructor(
    private readonly storage: Storage,
    private readonly clock: Clock,
  ) {}

  private async loadSchema(): Promise<ShaclLiteSchema> {
    const custom = await this.storage.readText(SHACL_STORAGE_PATH);
    if (custom) {
      try {
        return parse(custom) as ShaclLiteSchema;
      } catch {
        console.error("[structural-validator] failed to parse custom shacl-lite.yaml, using bundled default");
      }
    }
    return loadBundledSchema();
  }

  async validate(problemId: string, graph: FlowGraph): Promise<ValidationReport> {
    const schema = await this.loadSchema();
    const violations: ValidationViolation[] = [];

    for (const rule of schema.rules) {
      violations.push(...runRule(rule, graph));
    }

    const report: ValidationReport = {
      version: REPORT_VERSION,
      generatedAt: this.clock.isoNow(),
      problemId,
      violations,
      isValid: violations.every((v) => v.severity !== "error"),
    };

    await this.storage.writeJsonAtomic(GOVERNANCE_CONFIG.VALIDATION_REPORT_PATH, report);
    return report;
  }
}
