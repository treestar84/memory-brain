#!/usr/bin/env bun
import { resolve } from "node:path";
import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { ActiveProblemStore } from "../src/core/binder/ActiveProblemStore";
import { FlowGraphStore } from "../src/core/flow/FlowGraphStore";
import { StructuralValidator } from "../src/core/governance/StructuralValidator";

const PROJECT = process.env.CFGM_PROJECT || process.cwd();
const storage = new FsStorage(resolve(PROJECT, ".memory-brain"));
const clock = new RealClock();
const problemStore = new ActiveProblemStore(storage, clock);
const flowStore = new FlowGraphStore(storage, clock);
const validator = new StructuralValidator(storage, clock);

const args = process.argv.slice(2);
const problemIdx = args.indexOf("--problem");
const jsonMode = args.includes("--json");

async function main() {
  let problemId: string;

  if (problemIdx >= 0) {
    problemId = args[problemIdx + 1];
    if (!problemId) {
      console.error("--problem <id> requires an id argument");
      process.exit(1);
    }
  } else {
    const active = await problemStore.getActive();
    if (!active) {
      console.error("[cfgm-validate] 활성 문제 없음. --problem <id>로 지정하거나 문제를 먼저 생성하세요.");
      process.exit(1);
    }
    problemId = active.id;
  }

  const snapshot = await flowStore.readSnapshot(problemId);
  if (!snapshot) {
    console.error(`[cfgm-validate] 그래프 스냅샷 없음: ${problemId}`);
    process.exit(1);
  }

  const report = await validator.validate(problemId, snapshot);

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.isValid ? 0 : 1);
  }

  // Human-readable output
  const errorCount = report.violations.filter((v) => v.severity === "error").length;
  const warnCount = report.violations.filter((v) => v.severity === "warning").length;

  console.log(`## 검증 결과: ${problemId}`);
  console.log(`상태: ${report.isValid ? "✅ 유효" : "❌ 오류 있음"}`);
  console.log(`오류: ${errorCount}건  경고: ${warnCount}건`);

  if (report.violations.length > 0) {
    console.log();
    for (const v of report.violations) {
      const icon = v.severity === "error" ? "❌" : "⚠️";
      const block = v.blockId ? ` [${v.blockId}]` : "";
      console.log(`${icon} [${v.ruleId}]${block} ${v.message}`);
    }
  }

  console.log(`\n리포트 저장: .memory-brain/state/validation-report.json`);
  process.exit(report.isValid ? 0 : 1);
}

main().catch((e) => {
  console.error("[cfgm-validate]", e.message);
  process.exit(1);
});
