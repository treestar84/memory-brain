#!/usr/bin/env bun
import { resolve } from "node:path";
import { homedir } from "node:os";
import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { OntologyModule } from "../src/core/ontology/OntologyModule";
import { PromotionEngine } from "../src/core/ontology/PromotionEngine";

const PROJECT = process.env.CFGM_PROJECT || process.cwd();
const USER_HOME = process.env.CFGM_USER_HOME || resolve(homedir(), ".memory-brain");

const storage = new FsStorage(resolve(PROJECT, ".memory-brain"));
const userStorage = new FsStorage(USER_HOME);
const clock = new RealClock();
const ontologyModule = new OntologyModule(storage, clock);
const promotionEngine = new PromotionEngine(ontologyModule, userStorage, clock);

const args = process.argv.slice(2);
const problemIdx = args.indexOf("--problem");
if (problemIdx < 0) {
  console.error("--problem <id> required");
  process.exit(1);
}
const problemId = args[problemIdx + 1];
const shouldResolve = args.includes("--resolve");

async function main() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks).toString("utf-8").trim();

  if (body) {
    const { blockTypeCounts } = JSON.parse(body) as {
      blockTypeCounts: Record<string, number>;
    };
    const existing = await ontologyModule.read(problemId);
    if (!existing) {
      await ontologyModule.create(problemId, "general-task", "1.0.0");
    }
    await ontologyModule.recordPatterns(problemId, blockTypeCounts);
  }

  if (shouldResolve) {
    const existing = await ontologyModule.read(problemId);
    if (!existing) {
      console.error(`module not found: ${problemId}`);
      process.exit(1);
    }
    const updated = await ontologyModule.incrementResolvedRuns(problemId);
    console.log(`resolvedRuns=${updated.resolvedRuns}`);
    const promoted = await promotionEngine.maybePromote(updated);
    if (promoted) console.log(`promoted to ${USER_HOME}/ontologies/promoted/${updated.templateId}/`);
  }

  const final = await ontologyModule.read(problemId);
  process.stdout.write(JSON.stringify(final, null, 2) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
