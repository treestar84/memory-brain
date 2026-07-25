#!/usr/bin/env bun
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, statSync } from "node:fs";
import { resolveStorageRoot } from "../src/hooks/bootstrap";
import { t } from "../src/core/i18n/messages";

/**
 * cfgm — CFGM-OS 통합 CLI (V3.31).
 *
 * 52개 개별 스크립트 (`bun run bin/cfgm-*.ts`) 의 단일 진입점.
 *
 *   cfgm help              전체 명령 (그룹별)
 *   cfgm doctor            설치·환경 자가진단
 *   cfgm <command> [args]  해당 스크립트 실행 (예: cfgm bench, cfgm ssl-status)
 *
 * 등록되지 않은 이름도 bin/cfgm-<name>.ts 가 존재하면 실행된다 —
 * 신규 스크립트 추가 시 registry 갱신을 잊어도 동작이 깨지지 않는다.
 *
 * 전역 설치: `bun link` (repo 루트에서 1회) → 어디서든 `cfgm` 사용.
 */

const BIN_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(BIN_DIR, "..");

interface CommandDef {
  name: string;
  script: string; // bin/ 내 파일명 (확장자 제외)
  desc: string;
}

interface CommandGroup {
  title: string;
  commands: CommandDef[];
}

export const COMMAND_GROUPS: CommandGroup[] = [
  {
    title: "시작하기",
    commands: [
      { name: "doctor", script: "(내장)", desc: "설치·환경 자가진단 + 권장 조치" },
      { name: "install", script: "install-brain", desc: "~/.claude-brain 프로파일 설치" },
      { name: "uninstall", script: "uninstall-brain", desc: "프로파일 제거" },
    ],
  },
  {
    title: "검색·인덱스",
    commands: [
      { name: "rebuild-index", script: "cfgm-rebuild-index", desc: "wiki+claim+SSL 인덱스 재생성 (--embeddings: hybrid)" },
      { name: "search", script: "cfgm-search", desc: "wiki 자연어 검색 — \"cfgm search \\\"질의\\\"\"" },
      { name: "ask", script: "cfgm-ask", desc: "질의 → claim id 인용 근거 번들 (host LLM 프롬프트 컴포저)" },
      { name: "stats", script: "cfgm-stats", desc: "search/ask 사용 통계 요약 (--days N, --json)" },
      { name: "bench", script: "cfgm-bench", desc: "내부 memory quality benchmark" },
      { name: "bench-lme", script: "cfgm-lme-retrieval", desc: "LongMemEval retrieval 벤치마크 (외부 표준)" },
      { name: "rot-bench", script: "cfgm-rot-bench", desc: "메모리 부패(rot) 벤치마크 — 세션 축적 강건성 (naive vs governed)" },
      { name: "okf-export", script: "cfgm-okf-export", desc: "L3 wiki → Google OKF v0.1 번들" },
    ],
  },
  {
    title: "SSL·스킬 (KG-Brain)",
    commands: [
      { name: "ssl-enqueue", script: "cfgm-ssl-enqueue", desc: "SKILL.md → SSL 변환 큐 생성" },
      { name: "ssl-status", script: "cfgm-ssl-status", desc: "normalize 큐 상태 (+stale)" },
      { name: "ssl-reap", script: "cfgm-ssl-reap", desc: "orphan in_progress job 회수" },
      { name: "ssl-stats", script: "cfgm-ssl-stats", desc: "canonical 사용률 등 지표" },
      { name: "ssl-validate", script: "cfgm-ssl-validate", desc: "SSL JSON 스키마 검증" },
      { name: "viewer", script: "cfgm-ssl-viewer", desc: "KG-Brain 대시보드 (localhost:4041)" },
      { name: "run", script: "cfgm-run", desc: "SSL 스킬 실행 계획/interactive 실행" },
      { name: "learn", script: "cfgm-learn", desc: "워크플로우 학습 → SSL 저장" },
      { name: "replay", script: "cfgm-replay", desc: "저장 워크플로우 재실행 plan" },
      { name: "find-chain", script: "cfgm-find-chain", desc: "goal → 스킬 체인 발견" },
      { name: "compose", script: "cfgm-compose", desc: "COMPOSES 추론 + 사이클 감지" },
      { name: "graph-query", script: "cfgm-graph-query", desc: "KG 그래프 쿼리" },
    ],
  },
  {
    title: "Claim·거버넌스",
    commands: [
      { name: "claim-list", script: "cfgm-claim-list", desc: "claim 후보 목록" },
      { name: "claim-review", script: "cfgm-claim-review", desc: "claim 후보 검토" },
      { name: "governance-report", script: "cfgm-governance-report", desc: "중복·stale·모순 보고서" },
      { name: "decay", script: "cfgm-decay", desc: "wiki page 망각 판정 (--archive <id>: 보관 이동, 삭제 아님)" },
      { name: "persona-list", script: "cfgm-persona-list", desc: "persona 프로파일 조회" },
    ],
  },
  {
    title: "LongMemEval QA (host-위임)",
    commands: [
      { name: "lme-enqueue", script: "cfgm-lme-enqueue", desc: "answer job 생성 (PAI 세션 처리용)" },
      { name: "lme-score", script: "cfgm-lme-score", desc: "QA 채점 (--judge-enqueue/--collect)" },
    ],
  },
  {
    title: "수집 (Capture, host-위임)",
    commands: [
      { name: "capture", script: "cfgm-capture", desc: "세션 기록 → wiki draft 추출 큐 생성" },
      { name: "capture-status", script: "cfgm-capture-status", desc: "capture 큐 + drafts 상태" },
      { name: "capture-accept", script: "cfgm-capture-accept", desc: "draft → concept/decision/project 승격" },
    ],
  },
];

const REGISTRY = new Map<string, CommandDef>();
for (const g of COMMAND_GROUPS) for (const c of g.commands) REGISTRY.set(c.name, c);

function printHelp(): void {
  console.log(`cfgm — CFGM-OS (Causal Flow Gap Memory OS) 통합 CLI\n`);
  console.log(`사용법: cfgm <command> [args...]   (전역 설치: repo 루트에서 'bun link')\n`);
  for (const g of COMMAND_GROUPS) {
    console.log(`${g.title}`);
    for (const c of g.commands) console.log(`  ${c.name.padEnd(20)} ${c.desc}`);
    console.log("");
  }
  console.log(`미등록 명령도 bin/cfgm-<name>.ts 가 있으면 실행됩니다.`);
  console.log(`자세한 옵션: cfgm <command> --help 또는 해당 스크립트 헤더 주석 참조.`);
}

async function runDoctor(): Promise<number> {
  type Check = { name: string; ok: boolean; detail: string; fix?: string };
  const checks: Check[] = [];

  // 1. bun 버전
  const bunVer = Bun.version;
  const [maj, min] = bunVer.split(".").map((x) => Number.parseInt(x, 10));
  const bunOk = maj! > 1 || (maj === 1 && min! >= 1);
  checks.push({
    name: t("doctor.check.bun.name"),
    ok: bunOk,
    detail: `v${bunVer}`,
    fix: bunOk ? undefined : "curl -fsSL https://bun.sh/install | bash",
  });

  // 2. 의존성 설치
  const depsOk = existsSync(join(REPO_ROOT, "node_modules", "yaml"));
  checks.push({
    name: t("doctor.check.deps.name"),
    ok: depsOk,
    detail: depsOk ? t("doctor.check.deps.detail.ok") : t("doctor.check.deps.detail.fail"),
    fix: depsOk ? undefined : "bun install",
  });

  // 3. 레포 구조
  const routerOk = existsSync(join(REPO_ROOT, "memory", "ROUTER.md"));
  checks.push({
    name: t("doctor.check.repo.name"),
    ok: routerOk,
    detail: routerOk ? t("doctor.check.repo.detail.ok") : t("doctor.check.repo.detail.fail"),
  });

  // 4. 검색 인덱스 — rebuild-index 와 동일한 storage 해석 사용
  const indexPath = join(resolveStorageRoot(), "indexes", "search.sqlite");
  if (existsSync(indexPath)) {
    // WAL 모드에서는 본 파일 mtime 이 갱신되지 않음 — -wal/-shm 까지 최신값 사용
    const mtimes = [indexPath, `${indexPath}-wal`, `${indexPath}-shm`]
      .filter((p) => existsSync(p))
      .map((p) => statSync(p).mtimeMs);
    const ageDays = Math.floor((Date.now() - Math.max(...mtimes)) / 86_400_000);
    const fresh = ageDays <= 7;
    checks.push({
      name: t("doctor.check.index.name"),
      ok: true,
      detail: t("doctor.check.index.detail.exists", indexPath, ageDays),
      fix: fresh ? undefined : t("doctor.check.index.fix.stale"),
    });
  } else {
    checks.push({
      name: t("doctor.check.index.name"),
      ok: false,
      detail: t("doctor.check.index.detail.missing"),
      fix: t("doctor.check.index.fix.missing"),
    });
  }

  // 5. SSL normalize 큐
  const jobsDir = join(REPO_ROOT, "memory", "_pending", "normalize", "jobs");
  let pending = 0;
  let stale = 0;
  if (existsSync(jobsDir)) {
    const glob = new Bun.Glob("**/*.job.md");
    for await (const rel of glob.scan({ cwd: jobsDir })) {
      const txt = await Bun.file(join(jobsDir, rel)).text();
      if (/^status:\s*pending\s*$/m.test(txt)) pending++;
      if (/^status:\s*in_progress\s*$/m.test(txt)) {
        const lease = /^lease_expires_at:\s*(\S+)/m.exec(txt);
        if (!lease || new Date(lease[1]!).getTime() < Date.now()) stale++;
      }
    }
  }
  checks.push({
    name: t("doctor.check.sslQueue.name"),
    ok: stale === 0,
    detail: `pending=${pending} stale=${stale}`,
    fix:
      stale > 0
        ? t("doctor.check.sslQueue.fix.stale")
        : pending > 0
          ? t("doctor.check.sslQueue.fix.pending")
          : undefined,
  });

  // 6. Brain 프로파일 (선택)
  const brainHome = process.env.CFGM_BRAIN_HOME ?? join(process.env.HOME ?? "", ".claude-brain");
  const brainInstalled = existsSync(brainHome);
  checks.push({
    name: t("doctor.check.brain.name"),
    ok: true,
    detail: brainInstalled ? t("doctor.check.brain.detail.installed", brainHome) : t("doctor.check.brain.detail.notInstalled"),
    fix: brainInstalled ? undefined : t("doctor.check.brain.fix"),
  });

  // 7. LongMemEval 데이터셋 (선택)
  const lmeData = join(REPO_ROOT, "data", "longmemeval", "longmemeval_s_cleaned.json");
  checks.push({
    name: t("doctor.check.lme.name"),
    ok: true,
    detail: existsSync(lmeData) ? t("doctor.check.lme.detail.downloaded") : t("doctor.check.lme.detail.missing"),
  });

  console.log(t("doctor.header"));
  let failCount = 0;
  for (const c of checks) {
    const mark = c.ok ? "✓" : "✗";
    if (!c.ok) failCount++;
    console.log(`${mark} ${c.name.padEnd(24)} ${c.detail}`);
    if (c.fix) console.log(`    → ${c.fix}`);
  }
  console.log(failCount === 0 ? t("doctor.allPass") : t("doctor.someFail", failCount));
  return failCount === 0 ? 0 : 1;
}

// ---- main ----
const [cmd, ...rest] = process.argv.slice(2);

if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
  printHelp();
  process.exit(0);
}

if (cmd === "doctor") {
  process.exit(await runDoctor());
}

const def = REGISTRY.get(cmd);
let scriptFile: string | null = null;
if (def && def.script !== "(내장)") {
  scriptFile = `${def.script}.ts`;
} else if (!def) {
  // registry 밖 이름 — bin/cfgm-<name>.ts 또는 bin/<name>.ts 직접 탐색
  for (const candidate of [`cfgm-${cmd}.ts`, `${cmd}.ts`]) {
    if (existsSync(join(BIN_DIR, candidate))) {
      scriptFile = candidate;
      break;
    }
  }
}

if (!scriptFile) {
  console.error(`알 수 없는 명령: ${cmd}`);
  const near = Array.from(REGISTRY.keys()).filter((k) => k.includes(cmd) || cmd.includes(k));
  if (near.length > 0) console.error(`비슷한 명령: ${near.join(", ")}`);
  console.error(`전체 목록: cfgm help`);
  process.exit(2);
}

const proc = Bun.spawn(["bun", "run", join(BIN_DIR, scriptFile), ...rest], {
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
  env: process.env as Record<string, string>,
});
process.exit(await proc.exited);
