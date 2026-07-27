import { resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { existsSync, readFileSync } from "node:fs";

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
import { SettingsReader, defaultSettingsPath } from "../core/settings/SettingsReader";
import { PromotionLedger } from "../core/identity/PromotionLedger";
import { CandidateDetector } from "../core/identity/CandidateDetector";
import { ClaimStore } from "../core/claim/ClaimStore";
import { FlowBlockToClaimCandidate } from "../core/claim/FlowBlockToClaimCandidate";
import { FlowGraphProjector } from "../core/flow/FlowGraphProjector";
import { PersonaStore } from "../core/persona/PersonaStore";
import { Router } from "../core/router/Router";
import { AutoTrigger } from "../core/auto-trigger/AutoTrigger";
import { SessionStartBudget } from "../core/context-budget/SessionStartBudget";
import { LearningLedger } from "../core/learning/LearningLedger";
import { DetectorWeight } from "../core/learning/DetectorWeight";

export function resolveStorageRoot(): string {
  if (process.env.CFGM_HOME) return process.env.CFGM_HOME;
  if (process.env.CFGM_PROJECT) return resolve(process.env.CFGM_PROJECT, ".memory-brain");
  if (process.env.CFGM_PROJECT_ROOT) return resolve(process.env.CFGM_PROJECT_ROOT, ".memory-brain");
  const home = process.env.HOME || homedir();
  return resolve(home, ".claude-brain", "memory-brain");
}

export function resolveProjectRoot(): string {
  if (process.env.CFGM_PROJECT) return resolve(process.env.CFGM_PROJECT);
  if (process.env.CFGM_PROJECT_ROOT) return resolve(process.env.CFGM_PROJECT_ROOT);
  const storageRoot = resolveStorageRoot();
  if (storageRoot.endsWith(".memory-brain")) return dirname(storageRoot);
  return storageRoot;
}

let warnedRepoRootOnce = false;

/**
 * bin/cfgm-*.ts 전체가 `memory/` 를 읽고 쓸 때 쓰는 repoRoot 해석의 단일 진입점.
 *
 * V3.42 실사용 시뮬레이션에서 실제로 발생한 사고: CFGM_PROJECT_ROOT 를 안 정하고
 * memory-brain 툴 저장소 자체 디렉토리에서 `cfgm capture` 등을 실행하면, cwd 가
 * 그대로 repoRoot 가 되어 **사용자의 기억이 툴 저장소 자체의 memory/ 에 섞여
 * 들어간다** — 이후 툴 저장소를 정리하면 그 기억이 조용히 영구 소실된다.
 *
 * memory-brain 이 자기 자신을 dogfood 하는 것(이 저장소에서 CFGM_PROJECT_ROOT
 * 없이 명령을 도는 것)은 의도된 정상 사용법이라 **차단하면 안 된다** — 대신 그
 * 경우를 stderr 경고로 눈에 띄게 만들어, 의도치 않게 툴 저장소에 쓰고 있다면
 * 그 자리에서 알아채고 CFGM_PROJECT_ROOT 를 지정하도록 유도한다. 프로세스당 1회만
 * 출력해 반복 호출 시 노이즈가 되지 않게 한다.
 */
export function resolveRepoRoot(): string {
  const explicit = process.env.CFGM_PROJECT_ROOT ?? process.env.CFGM_PROJECT;
  const root = resolve(explicit ?? process.cwd());
  if (!explicit && !warnedRepoRootOnce && isMemoryBrainToolRepo(root)) {
    warnedRepoRootOnce = true;
    console.error(
      `⚠️  CFGM_PROJECT_ROOT 가 지정되지 않아 memory-brain 툴 저장소 자체(${root})를 대상으로 동작합니다.\n` +
        `   다른 프로젝트를 의도했다면 그 디렉토리로 이동하거나 CFGM_PROJECT_ROOT=<프로젝트 경로> 를 지정하세요.`,
    );
  }
  return root;
}

function isMemoryBrainToolRepo(dir: string): boolean {
  const pkgPath = resolve(dir, "package.json");
  if (!existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return pkg?.name === "cfgm-os";
  } catch {
    return false;
  }
}

export function buildClaimStorage(): FsStorage {
  return new FsStorage(resolveProjectRoot());
}

export type BootstrappedDeps = {
  storageRoot: string;
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
  settingsReader: SettingsReader;
  promotionLedger: PromotionLedger;
  candidateDetector: CandidateDetector;
  claimStore: ClaimStore;
  flowBlockToClaim: FlowBlockToClaimCandidate;
  flowGraphProjector: FlowGraphProjector;
  personaStore: PersonaStore;
  router: Router;
  autoTrigger: AutoTrigger;
  sessionStartBudget: SessionStartBudget;
  learningLedger: LearningLedger;
  detectorWeight: DetectorWeight;
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
  const settingsReader = new SettingsReader(defaultSettingsPath());
  const learningLedger = new LearningLedger(storage, clock);
  const detectorWeight = new DetectorWeight(learningLedger);
  const promotionLedger = new PromotionLedger(storage, clock, learningLedger);
  const candidateDetector = new CandidateDetector(clock);
  const claimStore = new ClaimStore(buildClaimStorage(), clock, learningLedger);
  const flowBlockToClaim = new FlowBlockToClaimCandidate(clock);
  const flowGraphProjector = new FlowGraphProjector();
  const personaStore = new PersonaStore(storage, clock);
  const router = new Router();
  const autoTrigger = new AutoTrigger(storage, clock);
  const sessionStartBudget = new SessionStartBudget();

  return {
    storageRoot: root,
    storage, clock, problemStore, queue, ledger, expirer, bundler,
    injector, fallback, ontologyModule, resumeReader, resumeWriter,
    decayEngine, flowStore, normalizer, redactor, questionQueue, settingsReader,
    promotionLedger, candidateDetector,
    claimStore, flowBlockToClaim, flowGraphProjector,
    personaStore, router, autoTrigger, sessionStartBudget,
    learningLedger, detectorWeight,
  };
}
