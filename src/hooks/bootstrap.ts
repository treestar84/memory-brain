import { resolve } from "node:path";
import { homedir } from "node:os";

import { FsStorage } from "../core/storage/FsStorage";
import { RealClock } from "../core/clock/Clock";
import { ActiveProblemStore } from "../core/binder/ActiveProblemStore";
import { PendingQueue } from "../core/ledger/PendingQueue";
import { RawLedger } from "../core/ledger/RawLedger";
import { Expirer } from "../core/ledger/Expirer";
import { ObservationBundler } from "../core/flow/ObservationBundler";
import { CueCardInjector } from "../core/flow/CueCardInjector";
import { CueCardFallback } from "../core/flow/CueCardFallback";
import { OntologyModule } from "../core/ontology/OntologyModule";
import { ResumeSheetReader } from "../core/compaction/ResumeSheetReader";
import { ResumeSheetWriter } from "../core/compaction/ResumeSheetWriter";
import { StaleDecayEngine } from "../core/governance/StaleDecayEngine";
import { FlowGraphStore } from "../core/flow/FlowGraphStore";
import { ObservationNormalizer } from "../core/normalizer/ObservationNormalizer";
import { Redactor } from "../core/security/Redactor";
import { QuestionQueue } from "../core/gap/QuestionQueue";

export function resolveStorageRoot(): string {
  if (process.env.CFGM_HOME) return process.env.CFGM_HOME;
  if (process.env.CFGM_PROJECT) return resolve(process.env.CFGM_PROJECT, ".memory-brain");
  if (process.env.CFGM_PROJECT_ROOT) return resolve(process.env.CFGM_PROJECT_ROOT, ".memory-brain");
  const home = process.env.HOME || homedir();
  return resolve(home, ".claude-brain", "memory-brain");
}

export type BootstrappedDeps = {
  storage: FsStorage;
  clock: RealClock;
  problemStore: ActiveProblemStore;
  queue: PendingQueue;
  ledger: RawLedger;
  expirer: Expirer;
  bundler: ObservationBundler;
  injector: CueCardInjector;
  fallback: CueCardFallback;
  ontologyModule: OntologyModule;
  resumeReader: ResumeSheetReader;
  resumeWriter: ResumeSheetWriter;
  decayEngine: StaleDecayEngine;
  flowStore: FlowGraphStore;
  normalizer: ObservationNormalizer;
  redactor: Redactor;
  questionQueue: QuestionQueue;
};

export function buildDeps(root: string = resolveStorageRoot()): BootstrappedDeps {
  const storage = new FsStorage(root);
  const clock = new RealClock();

  const ontologyModule = new OntologyModule(storage, clock);
  const problemStore = new ActiveProblemStore(storage, clock, ontologyModule);
  const queue = new PendingQueue(storage, clock);
  const ledger = new RawLedger(storage, clock);
  const expirer = new Expirer(storage, clock);
  const bundler = new ObservationBundler(storage, clock);
  const injector = new CueCardInjector();
  const fallback = new CueCardFallback();
  const flowStore = new FlowGraphStore(storage, clock);
  const questionQueue = new QuestionQueue(storage, clock);
  const resumeReader = new ResumeSheetReader(storage);
  const resumeWriter = new ResumeSheetWriter(storage, clock, problemStore, flowStore, questionQueue);
  const decayEngine = new StaleDecayEngine(flowStore, clock);
  const redactor = new Redactor(storage, clock);
  const normalizer = new ObservationNormalizer(redactor);

  return {
    storage, clock, problemStore, queue, ledger, expirer, bundler,
    injector, fallback, ontologyModule, resumeReader, resumeWriter,
    decayEngine, flowStore, normalizer, redactor, questionQueue,
  };
}
