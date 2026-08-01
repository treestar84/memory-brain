import { resolve, dirname } from "node:path";
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

/**
 * V3.43 실효성 검증 시뮬레이션에서 실제로 재현된 사고: env var 미지정 시 이 함수가
 * 고정된 홈 디렉터리 경로(`~/.claude-brain/memory-brain`)로 폴백했던 반면
 * `resolveRepoRoot()`는 cwd 기준으로 프로젝트별로 갈렸다. 그 결과 검색 인덱스가
 * 프로젝트 간에 전역 공유되어, 한 프로젝트에서 `rebuild-index`를 돌리면 다른
 * 프로젝트(또는 memory-brain 툴 저장소 자신)의 검색 결과가 조용히 사라졌다.
 * `resolveRepoRoot()`와 동일하게 cwd 기준으로 폴백하도록 맞춰 프로젝트별 분리를
 * 보장한다. `CFGM_HOME`은 사용자가 명시적으로 전역 공유를 원할 때 쓰는 override로
 * 그대로 유지한다.
 */
/**
 * 훅 command 문자열에서 `--project-root <path>` 를 읽는다 (V3.44, Windows 지원).
 * 기존엔 훅 command 가 `/usr/bin/env CFGM_PROJECT_ROOT=<path> bun run <script>`
 * 형태였는데, `/usr/bin/env` 도 `VAR=val cmd` 인라인 환경변수 문법도 POSIX 셸
 * 전용이라 Windows 에서 훅이 전부 실패했다. 이제 새로 설치되는 훅은 env 접두사
 * 대신 `bun run <script> --project-root <path>` 로 값을 넘긴다(순수 프로그램+인자
 * 형태라 셸 종류를 덜 탄다). 기존 설치(env 접두사 방식)는 재설치 전까지 그대로
 * 남아있으므로, CFGM_PROJECT_ROOT 환경변수 경로는 하위호환을 위해 계속 지원한다.
 */
function readArgFlag(argv: string[], flag: string): string | null {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1]! : null;
}

function readProjectRootArg(argv: string[]): string | null {
  return readArgFlag(argv, "--project-root");
}

/**
 * 우선순위: argv `--home`/`--project-root` > CFGM_HOME > CFGM_PROJECT > CFGM_PROJECT_ROOT > cwd.
 * argv 를 최우선으로 둔 이유: 훅 스크립트를 호출한 그 명령 자체가 가장 구체적인
 * 지시이고(대부분의 CLI 관행과 동일 — 플래그가 환경변수보다 우선), 이렇게 하면
 * 설치된 훅의 목적지가 그 훅을 부른 프로세스 환경의 우연한 env var 값에 좌우되지
 * 않는다. 기존 env-접두사 방식 설치는 argv 자체가 없으므로 동작이 전혀 안 바뀐다.
 * `--home` 은 install-brain.ts(전역 ~/.claude-brain 프로필, 이전엔 `CFGM_HOME=<path>`
 * env 접두사)이 쓰고, `--project-root` 는 install-project.ts(프로젝트별 설치,
 * 이전엔 `CFGM_PROJECT_ROOT=<path>`)가 쓴다 — CFGM_HOME 은 storage root 값
 * 그 자체(뒤에 `.memory-brain` 안 붙음)이므로 `--home` 도 동일하게 처리한다.
 */
export function resolveStorageRoot(argv: string[] = process.argv): string {
  const homeArg = readArgFlag(argv, "--home");
  if (homeArg) return homeArg;
  const argvRoot = readProjectRootArg(argv);
  if (argvRoot) return resolve(argvRoot, ".memory-brain");
  if (process.env.CFGM_HOME) return process.env.CFGM_HOME;
  if (process.env.CFGM_PROJECT) return resolve(process.env.CFGM_PROJECT, ".memory-brain");
  if (process.env.CFGM_PROJECT_ROOT) return resolve(process.env.CFGM_PROJECT_ROOT, ".memory-brain");
  return resolve(process.cwd(), ".memory-brain");
}

export function resolveProjectRoot(argv: string[] = process.argv): string {
  const argvRoot = readProjectRootArg(argv);
  if (argvRoot) return resolve(argvRoot);
  if (process.env.CFGM_PROJECT) return resolve(process.env.CFGM_PROJECT);
  if (process.env.CFGM_PROJECT_ROOT) return resolve(process.env.CFGM_PROJECT_ROOT);
  const storageRoot = resolveStorageRoot(argv);
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
export function resolveRepoRoot(argv: string[] = process.argv): string {
  const explicit = readProjectRootArg(argv) ?? process.env.CFGM_PROJECT_ROOT ?? process.env.CFGM_PROJECT;
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
