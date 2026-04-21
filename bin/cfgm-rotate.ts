#!/usr/bin/env bun
import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { ActiveProblemStore } from "../src/core/binder/ActiveProblemStore";
import { RotationEngine } from "../src/core/governance/RotationEngine";
import { GOVERNANCE_CONFIG } from "../src/core/governance/config";
import { resolveStorageRoot } from "../src/hooks/bootstrap";

const storage = new FsStorage(resolveStorageRoot());
const clock = new RealClock();
const problemStore = new ActiveProblemStore(storage, clock);
const engine = new RotationEngine(storage, clock, problemStore);

const args = process.argv.slice(2);
const applyMode = args.includes("--apply");
const jsonMode = args.includes("--json");

async function main() {
  const dryRun = !applyMode;
  const result = await engine.rotate({ dryRun });

  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (dryRun) {
    console.log(`## 아카이브 대상 미리보기 (dry-run)`);
    console.log(`기준: resolved 후 ${GOVERNANCE_CONFIG.ROTATION_DAYS}일 경과`);
    console.log();
    if (result.candidates.length === 0) {
      console.log("대상 없음.");
      return;
    }
    for (const id of result.candidates) {
      console.log(`  - ${id}`);
    }
    console.log();
    console.log(`${result.candidates.length}개 대상. 실행하려면 --apply 추가:`);
    console.log(`  bun run bin/cfgm-rotate.ts --apply`);
  } else {
    console.log(`## 아카이브 실행 결과`);
    if (result.rotated.length === 0) {
      console.log("이동된 문제 없음.");
      return;
    }
    for (const id of result.rotated) {
      console.log(`  ✅ ${id} → .archive/${id}/`);
    }
    console.log();
    console.log(`${result.rotated.length}개 아카이브 완료.`);
    console.log(`인덱스: .memory-brain/.archive/index.json`);
  }
}

main().catch((e) => {
  console.error("[cfgm-rotate]", e.message);
  process.exit(1);
});
