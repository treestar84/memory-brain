# CFGM-OS v2 Distribution / DX 설계 — OMC/OMX 벤치마킹 기반

작성: 2026-04-20
근거: T4 보고서 전체, T1 K-4, T5 Adversary A3/A7, RFC §11
관련 Epic: **Epic 12 (P0 필수)**

---

## 0. 문제 정의

**현상 (T5 A7)**:
- 우리: `cfgm-validate`, `cfgm-rotate`, `cfgm-process` 3개 운영 스킬만 존재
- OMX: state 10개 + logs + metrics
- OMC: sessions + handoffs + setup + doctor + hud
- `/cfgm-doctor`, `/cfgm-hud`, `/cfgm-setup` **없음** — team.md 요구사항 #5 달성 0%

**목표**: OMC/OMX 동등 수준의 운영 DX. **측정 가능한 성공 기준 8개**(§9)로 수용 판정.

---

## 1. OMC/OMX 벤치마킹 결과 (T4 §A 인용)

### 1.1 OMC 패턴 (훔칠 것)

| 스킬 | 패턴 | 우리 버전 |
|---|---|---|
| `omc-setup/SKILL.md:85-131` | `.omc-config.json.setupCompleted`/`setupVersion` pre-check → AskUserQuestion 3택 | `.memory-brain/install-progress.json` 기반 resume |
| `omc-setup/SKILL.md:136-154` | `setup-progress.sh resume` → 중단 시 재개/fresh | 동일 패턴 차용 |
| `omc-setup/SKILL.md:162-171` | Phase 1~4 순차, 각 phase md Read → 실행 | `skills/cfgm-setup/phases/*.md` |
| `omc-doctor/SKILL.md:46-75` | `<!-- OMC:VERSION:X -->` 마커 + companion drift | `<!-- CFGM:VERSION:X.Y.Z -->` 마커 도입 |
| `omc-doctor/SKILL.md:109-116` | Known plugin 이름 리스트 → legacy vs user-custom 구분 | `install-manifest.json` whitelist |
| `omc-doctor/SKILL.md:120-148` | Check/Status/Details 표 + Issues + Fixes + y/n | 12행 진단 리포트 |
| `hud/SKILL.md:80-97, 240-248` | statusLine object, 플랫폼별 path, legacy string 자동 마이그레이션 | object form 준수, safeMode ASCII fallback |
| `hud/SKILL.md:107-128` | minimal/focused/full 프리셋 + elements 토글 + thresholds | 동일 구조 + CFGM 고유 임계값 |
| `setup/SKILL.md:22-34` | 단일 entrypoint + 첫 인자 라우팅 | `/cfgm-setup {cmd}` |

### 1.2 OMX 패턴 (훔칠 것)

- **세션 ID 샤딩**: `.omx/state/sessions/<sessionId>/*.json` — 동시 세션 격리
- **일별 롤링 jsonl**: `.omx/logs/*-YYYY-MM-DD.jsonl` — 로그 회전
- **metrics.json 로컬 카운터**: 네트워크 호출 0

### 1.3 `.omc/project-memory.json` 패턴

- lastScanned + techStack + directoryMap → "프로젝트 이해 캐시"
- CFGM은 `active-problem.json`만 있음 → **프로젝트 메타 캐시 신설** 권장 (Epic 12 §2.5)

---

## 2. 현 `bin/install*.ts` 한계 분석 (T4 §B)

### 2.1 블로커 수준
- `bin/install.ts:19, 31-33`: **`Stop → stop.ts` 매핑은 버그**. 실제 파일은 `session-end.ts`. bb2c6d5가 `install-brain.ts`에서만 수정, **`install.ts`는 미수정** → 등록 즉시 런타임 에러
- `bin/install.ts:46-59`: MARKER 일치 시 **무조건 덮어쓰기** → 사용자 수정 무단 소실
- `bin/install.ts:63-67`: `SKILL_LINK = ~/.claude/skills/CFGM-OS` 단일, 다중 프로젝트 설치 시 충돌

### 2.2 기능 결손
- 버전 마커 부재 (OMC `<!-- OMC:VERSION -->` 상응 없음)
- 마이그레이션 경로 부재
- `$CLAUDE_CONFIG_DIR` 미지원
- dry-run 없음, rollback 없음
- 부분 실패 후 상태 검증 없음

### 2.3 쓰기 순서 위험
- `bin/install.ts:44-70`: settings → mkdir → symlink. **중간 실패 시 settings만 갱신된 상태 방치**

### 2.4 uninstall 위험
- `bin/uninstall*.ts`: version 마커 검증 없이 MARKER만으로 삭제 → v2 다중 프로파일 확장 시 다른 설치본 파손 위험

---

## 3. 재설계 — 5대 원칙

### 3.1 P1 Version-marked idempotent merge
- 모든 관리 파일에 `<!-- CFGM:VERSION:X.Y.Z -->` 또는 JSON key `cfgmVersion`
- 재실행 시 version 비교 → upgrade/downgrade 플로우 분기
- **AskUserQuestion 3택**: "Update managed files only / Run full setup again / Cancel"

### 3.2 P2 Phase-checkpointed install
- `.memory-brain/install-progress.json`: `{phase, completedSteps[], startedAt, pid}`
- 재실행 시 resume/fresh 프롬프트
- OMC `setup-progress.sh` 패턴 차용

### 3.3 P3 Transactional write order
- `~/.claude-brain/.staging/<uuid>/`에 모든 산출물 먼저 생성
- 전부 성공 시 `rename` 원자 교체
- 실패 시 staging만 삭제, 기존 설치 **무손상**

### 3.4 P4 Managed-file whitelist
- `install-manifest.json`: `{cfgmVersion, files[], hooksRegistered[], hashChecksums}`
- uninstall은 manifest 등록 파일만 삭제
- 외부 파일은 "unknown, leaving in place"로 로깅

### 3.5 P5 Preflight conflict detection
Install 전 충돌 매트릭스:
- settings.json hook matcher 중복?
- LOCAL_BIN_LINK 대상 파일 존재?
- SKILL_LINK 대상 심볼릭 링크 존재?
- Identity 파일 비어있음 여부?

충돌 발견 시 **AskUserQuestion 3택**: abort / adopt existing / overwrite with backup

---

## 4. 프로파일 모델

### 4.1 디렉토리 레이아웃

```
~/.claude-brain/                          ← user profile
  CLAUDE.md                               managed block
  memory-brain/
    identity/*.md                         (v1 + v1.5 유지)
    synthesizer/                          (Epic 13)
      drafts/ candidates/ shadow-runs/ approvals/ canary/
  profiles/
    user.json                             {id, priority: 1, cfgmVersion}
    team/<team-slug>.json                 {id, priority: 2, source: git-url}
  adapters/
    claude.json   {harness: "claude-pai", hooks: {SessionStart: ...}}
    codex.json    {harness: "codex-cli",  hooks: ...}
    gemini.json   {harness: "gemini-cli", hooks: ...}
  hud/
    cfgm-hud.mjs                          ← statusline wrapper
  secrets/
    anonymizer.key                        ← HMAC secret (R3)
  install.lock                            ← 동시 setup 방지
  history/settings/*.json                 ← settings.json 이전 버전 회수용

<project>/.memory-brain/                  ← project profile
  profile.json                            {id, priority: 3, linkedUser}
  install-manifest.json                   {cfgmVersion, files[], hooksRegistered[]}
  install-progress.json                   ← phase checkpoint
  onboarding-progress.json                ← 튜토리얼 state
  ledger/
    raw/ curated/ voi/ skill-trace/
    orphan-bundles.jsonl                  (Epic 7+)
  state/
    voi-weights.json                      (Epic 8)
    question-fatigue-<sessionId>.json     (Epic 9)
    skill-projection-cache.json           (Epic 10)
    temporal-policy.json                  (Epic 7)
    sessions/<sessionId>/                 (OMX 샤딩 차용)
      hud-state.json
      notify-state.json
  ontologies/
    staging/ promoted/v2/ exports/
  diag/
    snapshots/YYYY-MM-DDTHHMM.tar.gz
    anonymize.json
  recovery/
    settings.json.broken-<ts>             ← 파싱 실패본 격리
```

### 4.2 우선순위 해결

**project > user > team**.
- 동일 슬롯 키 다중 정의 발견 시 session-start 넛지 1줄 경고
- `/cfgm-doctor`에 "Key collision" 행 노출
- team 측 override 선언 UX 지원

### 4.3 Cross-platform adapter

- hook file path와 envelope wrapper만 `adapters/<harness>.json`에 선언
- 단일 `src/hooks/*.ts` 구현은 harness별 adapter가 감싸서 재사용
- 지원 harness: claude-pai, codex-cli, gemini-cli
- **수용 조건**: adapter 추가 시 `src/hooks/*.ts` **수정 0줄**

---

## 5. `/cfgm-doctor` 명세

### 5.1 출력 형식 (OMC doctor:120-148 차용)

```
## CFGM-OS Doctor Report

### Summary
[HEALTHY / WARN / CRITICAL]  cfgmVersion: 2.0.0  profile-stack: project>user

### Checks
| Check                     | Status   | Details                                   |
|---------------------------|----------|-------------------------------------------|
| cfgmVersion drift         | OK       | manifest=2.0.0, cache=2.0.0               |
| Hook registration (6)     | OK       | matcher=cfgm-os-brain, all 6 registered   |
| Hook file existence       | CRITICAL | src/hooks/stop.ts missing                 |
| settings.json schema      | OK       | object form statusLine                    |
| CLAUDE.md managed block   | OK       | balanced markers, size 1.4KB              |
| Identity budget (20KB)    | WARN     | 21.3KB — exceeds budget                   |
| profile stack             | OK       | project .memory-brain > user              |
| PAI drift-lock integrity  | OK       | telos axiom hash unchanged                |
| Orphan synth drafts       | WARN     | 3 unapproved drafts older than 48h        |
| cross-harness adapters    | OK       | claude-pai wired; codex pending           |
| Ledger jsonl integrity    | OK       | last sync: 12m ago, no truncation         |
| Active session lock       | OK       | pid 38402 alive                           |

### Issues Found
- [WARN] Identity budget 1.3KB over limit
- [WARN] 3 unapproved synth drafts older than 48h

### Recommended Fixes
1. Reduce identity size? (y/n/edit) — 자동 diff preview
2. Auto-archive expired drafts? (y/n) — 48h 정책 적용

### Auto-Fix
(y/n/edit) for each fix, preview diff before apply.
```

### 5.2 진단 항목 (측정 규칙)

- **version drift**: `install-manifest.json.cfgmVersion` vs `package.json.version`
- **hook file existence**: 6 hook type × 1 file 누락 1개라도 CRITICAL
- **identity budget**: `bin/cfgm-identity-goal.ts:218-243` `identityBytes()` 재사용
- **PAI drift-lock**: telos.md 첫 axiom 섹션 sha256 vs 초기값
- **orphan synth drafts**: `synthesizer/drafts/*` mtime 48h 초과
- **ledger integrity**: 마지막 jsonl 라인 JSON.parse — 실패 시 E005

### 5.3 `--bundle` flag
- 모든 진단 신호를 `.memory-brain/diag/snapshots/YYYY-MM-DDTHHMM.tar.gz` 로 묶음
- 포함: settings.json **해시(원문 X)**, manifest, identity 크기만 (내용 X), 최근 ledger 1000줄, install-progress
- `diag/anonymize.json`에 마스킹 키 기록
- **PII 유출 0건** 보장 (grep 기반 redaction 테스트)

### 5.4 `--compare` flag (identity 전용)
- 3-way diff: last-known / current / pending-draft
- C4 충돌(self-generated vs user-edited) 해결 UX

---

## 6. `/cfgm-setup` 명세 (unified router)

### 6.1 라우팅

```
/cfgm-setup                 # full wizard (resume 프롬프트)
/cfgm-setup doctor          → /cfgm-doctor
/cfgm-setup --local         # project-only (.memory-brain 스캐폴드)
/cfgm-setup --global        # user + adapters
/cfgm-setup migrate 1→2     # 버전 마이그레이션 전용
/cfgm-setup migrate --rollback  # `.memory-brain/migrations/1-to-2/backup/`로 복귀
/cfgm-setup adopt           # 기존 수동 설치 adopt → manifest 생성
/cfgm-setup --force         # preflight 결과 무시 (권장 X)
/cfgm-setup --dry-run       # 실제 쓰기 없이 diff만 출력
/cfgm-setup --resume        # install-progress.json 기반 재개
/cfgm-setup --help
```

### 6.2 Phase 파일

- `skills/cfgm-setup/phases/01-preflight.md` — 충돌 감지, AskUserQuestion
- `skills/cfgm-setup/phases/02-staging.md` — `.staging/<uuid>/` 생성
- `skills/cfgm-setup/phases/03-commit.md` — rename 원자 교체 + manifest append
- `skills/cfgm-setup/phases/04-welcome.md` — onboarding 트리거

각 phase는 `install-progress.json`에 체크포인트 기록.

### 6.3 Onboarding Tutorial (4단계, 각 2분)

1. **"문제 하나 만들어봅시다"** — `/cfgm-new-problem` 예시
2. **"Identity 3분 인터뷰"** — `cfgm-identity-bootstrap` 트리거
3. **"Gap 하나 해소"** — 샘플 문제 + 의도적 빈 Cause → `/cfgm-process`
4. **"HUD 확인"** — 재기동 후 `[CFGM]` 라벨 노출 검증

각 단계 끝에 **"ok / later / skip all" AskUserQuestion**.
중단점은 `.memory-brain/onboarding-progress.json`.

---

## 7. `/cfgm-hud` 명세

### 7.1 프리셋

| 프리셋 | 내용 |
|---|---|
| minimal | `[CFGM] problem:<slug> gaps:<n>` |
| focused (기본) | `[CFGM] problem:<slug> gaps:<n> pending:<n> drift:<score> synth:<approved/total> ctx:<%>` |
| full | focused + `profile:<stack>` + `adapter:<harness>` + multi-line active-gap top 3 |

### 7.2 임계값 (경보 색상)

| 신호 | yellow | red |
|---|---|---|
| drift_score | > 0.3 | > 0.6 |
| synth_rejection_rate | > 0.8 | — (yellow only, 관찰 신호 부족 경고) |
| identity_bytes | — | > 20 * 1024 |
| pending_bundles | > 10 | > 30 |

### 7.3 구현

- `~/.claude-brain/hud/cfgm-hud.mjs` 래퍼
- settings.json은 **object form** (`hud/SKILL.md:80-97`)
- Legacy string 자동 마이그레이션(`hud/SKILL.md:240-248`)
- Unix: `$HOME` + forward slash / Windows: 절대경로
- safeMode (non-truecolor 터미널) ASCII fallback 필수

### 7.4 데이터 소스

- `~/.memory-brain/` + `.memory-brain/` read-only 300ms TTL 캐시
- OMX 샤딩 패턴: 세션별 `sessions/<sessionId>/hud-state.json`
- HUD 지연 **≤ 50ms** 수용 조건

---

## 8. 오류 메시지 카탈로그 (E-code)

**형식**: `[cfgm-E<번호>] <한 줄 진단> → <복구 명령 제안>`
모든 stderr 출력 이 형식만 허용 (테스트로 강제).

| 코드 | 조건 | 진단 | 복구 제안 |
|---|---|---|---|
| E001 | settings.json 파싱 실패 | `settings.json invalid JSON at byte <n>` | `/cfgm-setup doctor` |
| E002 | hook file 누락 | `hook <type> points to <path> but file missing` | `/cfgm-setup --force` or `bun run bin/install-brain.ts` |
| E003 | CLAUDE.md 마커 불균형 | `managed block markers unbalanced: begin=<n> end=<n>` | `/cfgm-setup doctor` → auto-fix (backup 제안) |
| E004 | identity budget 초과 | `identity size <n> bytes > 20KB` | `/cfgm-identity show` + goals done/축약 |
| E005 | ledger jsonl 손상 | `last line not valid JSON at <file>:<offset>` | `/cfgm-rotate --recover` |
| E006 | profile 충돌 | `key <k> collides: project=<v1> user=<v2>` | `/cfgm-doctor` |
| E007 | 동시 세션 lock 실패 | `identity.lock held by pid <n>` | pid 종료 or 10s 재시도 |
| E008 | version drift | `manifest=<a> cache=<b>` | `/cfgm-setup migrate <a>→<b>` |
| E009 | cross-harness adapter 비활성 | `codex adapter installed but no hooks registered` | `/cfgm-setup --global` |
| E010 | synth draft 미승인 만료 | `draft <id> expired after 48h, auto-archived` | (정보성) |

---

## 9. 측정 가능한 성공 기준 (Epic 12 수용 조건)

1. **재실행 멱등성**: version 동일 시 파일 hash-equal (테스트로 강제)
2. **부분 실패 복구율**: 5종 주입(perm/parse/sig/disk-full/lock) 후 복구 명령 1회로 HEALTHY ≥ **95%**
3. **doctor 오탐율**: 12행 중 0 (known file whitelist 기반)
4. **E-code 재현**: 10종 각각 재현 테스트 파일 존재
5. **Onboarding 완주율**: 로컬 progress.json stats ≥ **80%**
6. **HUD 지연**: ≤ **50ms** (read-only + 300ms TTL)
7. **Cross-harness adapter 추가**: `src/hooks/*.ts` 수정 **0줄**
8. **Diag snapshot 민감정보 유출**: **0건** (grep 기반 redaction 테스트)

---

## 10. 엣지케이스 8종 — 재현 시나리오 + 복구 경로

### EC-1 권한 거부 (writable 파일 아님)
- 재현: `chmod 400 ~/.claude-brain/settings.json` → `/cfgm-setup`
- 탐지: staging 단계 `access(W_OK)` preflight 실패 → E001 + `chmod` 제안
- 복구: 사용자 권한 수정 → `/cfgm-setup --resume`

### EC-2 동시 세션
- 재현: A 터미널 setup 중 B에서 `/cfgm-setup`
- 탐지: `install.lock` (pid + createdAt) + `kill -0` 검증
- 결과: B는 E007 변종 + 강제 진행 y/n 선택
- 복구: 대기 or stale lock(>30분) 자동 파기

### EC-3 부분 마이그레이션 (v1→v2 중단)
- 재현: `/cfgm-setup migrate 1→2` 실행 중 SIGKILL
- 탐지: `install-progress.json.phase='migrate-1-to-2' + completedSteps[]`
- 복구: `/cfgm-setup --resume` 다음 step부터 재실행 (각 step 멱등, rename-atomic)
- Rollback: `/cfgm-setup migrate --rollback` → `.memory-brain/migrations/1-to-2/backup/`로 원자 복귀

### EC-4 hook 등록 실패 (settings.json 스키마 깨짐)
- 재현: settings.json 문법 오류 (주석, trailing comma)
- 탐지: install 시 parse → 실패 시 **원본 유지**, E001 출력, `.claude-brain/recovery/settings.json.broken-<ts>`로 격리
- 복구: `/cfgm-setup doctor --repair-settings` → `.claude-brain/history/settings/*.json`에서 최후 정상 버전 회수

### EC-5 storage 손상 (ledger jsonl 중간 truncation)
- 재현: 마지막 줄 중간 바이트 자르기
- 탐지: `/cfgm-rotate` 또는 hook 쓰기 직전 parse → 실패 시 E005
- 복구: 깨진 줄만 `<file>.corrupted.jsonl`로 격리. append-only 특성으로 재가동

### EC-6 시간 역행 (NTP or 수동 date)
- 재현: `sudo date -s "2025-01-01"` → 훅 이벤트 → 복원
- 탐지: 훅 이벤트 `ts` 직전 `ts`보다 작으면 `clockSkew: true` + `monotonicSeq` 증가
- 복구: Distiller(Epic 13)가 clockSkew 이벤트 빈도 계산 제외. `/cfgm-doctor`가 skew 구간 리포트

### EC-7 PAI 충돌 (user.md·team policy 상이한 voice 선언)
- 재현: voice.md "항상 한국어" vs team policy "영어 기본"
- 탐지: 프로파일 스택 로드 시 동일 슬롯 키 다중 정의 (C2)
- 복구: project>user>team 우선순위, session-start 넛지 경고, `/cfgm-doctor`에 "Key collision" 행, team override UX

### EC-8 cross-harness 동시 쓰기
- 재현: claude-pai bootstrap 중 codex에서 tools.md 수동 편집
- 탐지: `identity.lock` 획득 실패 → synth는 drafts/에만 (C3). 외부 수동 편집은 차단하지 않되 다음 bootstrap 때 mtime+sha256 비교 → 변경 감지
- 복구: `/cfgm-doctor identity --compare` 3-way diff (last-known / current / pending-draft), y 승인 후 반영

---

## 11. Telemetry-free troubleshooting

**원칙**: 모든 진단 신호는 사용자 디스크에만. 네트워크 호출 0.

- `/cfgm-doctor --bundle` → `.memory-brain/diag/snapshots/YYYY-MM-DDTHHMM.tar.gz`
- 포함 항목:
  - settings.json **해시** (원문 X)
  - install-manifest
  - identity 크기 (내용 X)
  - 최근 ledger 1000줄 (anonymize.json에 마스킹 키 기록)
  - install-progress
- `cfgm issue-template` CLI → 스냅샷 경로 + 시스템 정보(OS, Bun version, claude binary version)를 마크다운으로 출력

---

## 12. OMC/OMX 패턴 매핑 표

| 요구사항 | OMC/OMX 패턴 | CFGM v2 구현 |
|---|---|---|
| 버전 마커 | OMC `<!-- OMC:VERSION:X -->` | `<!-- CFGM:VERSION:X.Y.Z -->` + `cfgmVersion` JSON key |
| 설치 재개 | OMC `setup-progress.sh resume` | `install-progress.json` |
| 프로젝트 메타 | `.omc/project-memory.json` | `.memory-brain/profile.json` + `install-manifest.json` |
| 세션 샤딩 | `.omx/state/sessions/<id>/*.json` | `.memory-brain/state/sessions/<id>/*.json` |
| 일별 로그 | `.omx/logs/*-YYYY-MM-DD.jsonl` | `ledger/*/YYYY/MM/DD/*.jsonl` (기존) |
| 메트릭 | `.omx/metrics.json` | `.memory-brain/state/metrics.json` (Epic 12 신설) |
| 진단 리포트 | `omc-doctor/SKILL.md:120-148` | `/cfgm-doctor` 12행 표 |
| 통합 라우터 | `setup/SKILL.md:22-34` | `/cfgm-setup {cmd}` |
| statusline | `hud/SKILL.md:80-97` object form | 동일 + CFGM 프리셋 3종 |
| 임계값 경보 | `hud/SKILL.md:107-128` | drift/synth/budget/pending 4종 |

---

## 13. 구현 순서 (Epic 12 내부 sequencing)

1. **Week 1**: K-4 install 단일화 (install.ts deprecate, install-brain 마커 통일) + manifest/progress.json 도입
2. **Week 2 전반**: `/cfgm-doctor` 구현 + E-code 10종 + 엣지케이스 8종 통합 테스트
3. **Week 2 후반**: `/cfgm-setup` 라우터 + phase 파일 + onboarding tutorial
4. **Week 2 말**: `/cfgm-hud` 프리셋 + safeMode + 임계값 경보
5. **Week 3 초**: migrate 1→2 + rollback + adopt 커맨드
6. **Week 3 말**: 8개 성공 기준 E2E 수용 테스트

---

## 14. 참고 파일

- `bin/install.ts:19, 31, 63-67` — Stop→stop.ts 버그, 단일 SKILL_LINK
- `bin/install-brain.ts:29-36, 91-100, 105-136, 71-89` — HOOK_FILES, managed block, LOCAL_BIN_LINK
- `bin/uninstall-brain.ts:1-30` — MARKER-only cleanup
- `.omc/project-memory.json:1-80` — 프로젝트 메타 캐시 패턴
- `.omx/state/sessions/<id>/{hud,notify,skill-active}-state.json` — 세션 샤딩
- `.omx/logs/*-YYYY-MM-DD.jsonl` — 일별 롤링
- `omc-setup/SKILL.md:85-131, 136-171`
- `omc-doctor/SKILL.md:46-75, 109-116, 120-148`
- `hud/SKILL.md:80-97, 107-128, 240-248`
- `setup/SKILL.md:22-34`
- `skills/cfgm-identity-bootstrap/SKILL.md:12-18, 53-57` — 인터뷰 승인 UX 재사용
- `bin/cfgm-identity-goal.ts:218-243` — identityBytes 재사용
