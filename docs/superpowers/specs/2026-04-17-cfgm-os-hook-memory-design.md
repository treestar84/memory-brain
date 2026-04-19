# CFGM-OS Hook 기반 자가-형성 온톨로지 메모리 시스템 — 설계 스펙

| 항목 | 값 |
|---|---|
| 스펙 ID | `SPEC-2026-04-17-cfgm-os` |
| 작성일 | 2026-04-17 |
| 원본 PRD | [`docs/hook_memory_system_invention_prd_ko.md`](../../hook_memory_system_invention_prd_ko.md) |
| 상태 | Draft → 사용자 리뷰 대기 |
| 다음 단계 | `superpowers:writing-plans` 스킬로 구현 계획 작성 |

---

## 1. 요약

원본 PRD에 정의된 CFGM-OS(Causal Flow Gap Memory OS)를 **작업 가능한 에픽/스토리 단위**로 분해하고, 구현 직전까지 결정이 필요한 핵심 이슈를 선결정한 설계 문서. 본 문서의 체크리스트가 곧 진척 관리의 단일 진실원천이다.

Phase 1(Epic 0 인프라 + Epic 1 MVP)을 상세 스토리로, 이후 Phase는 에픽 단위 골격만 정의한다. 각 Epic 진입 시점에 별도 브레인스톰으로 상세화한다.

---

## 2. 핵심 의사결정 로그

브레인스톰 과정에서 확정된 결정. **구현 중 재토론 금지**. 변경은 스펙 리비전으로만.

| # | 주제 | 결정 | 근거 |
|---|---|---|---|
| D1 | 스코프 분해 | 전체 6 Phase 에픽화. Phase 1만 상세 스토리 | PRD의 Phase 구조 존중, 범위 관리 |
| D2 | 지능 배치 | 하이브리드: 훅=결정적 규칙, 지능=Claude Code 본체 (외부 API 키 **없음**) | 사용자 요구 — "최대한 Claude Code가 동작해서 처리" |
| D3 | 런타임 | Bun | TypeScript 네이티브, cold start ~50ms |
| D4 | MVP 템플릿 | 단일 `general-task` 한 개 + 엄격 TDD | 추상도 위험은 테스트로 상쇄 |
| D5 | 큐 트리거 | 하이브리드: SessionStart 자동 + `/cfgm-process` 수동 | 누수 없음 + 긴급 탈출구 |
| D6 | 큐 망각 | 7일 TTL → `expired-analysis.jsonl`. Raw ledger는 영구 보존 | "삭제" 아닌 "레벨 다운"; 원본 불변 |
| D7 | Problem 전환 | 훅은 요약만 주입. 전환 판단은 Claude 본체의 자발적 스킬 호출 | D2 원칙 일관 |
| D8 | 저장소 스코프 | 하이브리드: 사용자 레벨(학습 자산) + 프로젝트 레벨(problem/ledger) | 크로스-프로젝트 학습과 민감 코드 격리 동시 달성 |
| D9 | 설치 방식 | `bin/install.ts` Bun 스크립트 (idempotent) | dogfood 반복 재설치 편의 |
| D10 | 플랫폼 중립성 | 3-레이어(어댑터 + 코어 + 스토리지) · Codex 확장 Epic 7 예약 | 사용자 요구 — "Codex에서도 쓸 여지" |
| D11 | 경로 표준 | `~/.memory-brain/` (사용자) · `$PROJECT/.memory-brain/` (프로젝트). 플랫폼 경로는 심볼릭 링크로 브리지 | 플랫폼 이동 시 데이터 이사 불필요 |
| D12 | Canonical Event | 모든 플랫폼 훅 JSON → 내부 표준 이벤트 타입으로 정규화 | 코어가 플랫폼에 중립 |

---

## 3. 아키텍처

### 3.1 3-레이어 구조

```
┌──────────────────────────────────────────────────────────┐
│ Platform Adapter Layer                                   │
│   adapters/claude-code/  (Phase 1~6에서 구현)             │
│     ├─ hook-runner.ts   (stdin JSON → CanonicalEvent)     │
│     ├─ mapper.ts        (플랫폼 스키마 ↔ 표준 스키마)      │
│     ├─ installer.ts     (settings.json 편집)              │
│     └─ skill-bridge.ts  (Skill 호출 프로토콜)              │
│   adapters/codex/  (Epic 7에서 구현, 인터페이스만 예약)    │
├──────────────────────────────────────────────────────────┤
│ Core Layer (platform-free · 100% 단위 테스트 가능)        │
│   core/events/     CanonicalEvent 타입 · 타입 가드         │
│   core/storage/    Storage 인터페이스 + Fs/Memory 구현    │
│   core/ledger/     Raw · Curated · Pending 큐 · Expirer  │
│   core/normalizer/ 결정적 Observation 정규화               │
│   core/binder/     Active Problem 상태                    │
│   core/flow/       Flow Block 모델 (Phase 2)              │
│   core/gap/        결손 탐지 · VOI 스코어링 (Phase 3)      │
│   core/ontology/   Micro-ontology 컴파일러 (Phase 4)      │
│   core/security/   민감 정보 필터                         │
├──────────────────────────────────────────────────────────┤
│ Storage Layer                                            │
│   $CFGM_HOME       기본 ~/.memory-brain/                  │
│   $PROJECT/.memory-brain/                                │
└──────────────────────────────────────────────────────────┘
```

### 3.2 5-레이어 데이터 흐름 (PRD §5 반영)

```
L0 Event (Claude Code 훅 stdin)
  ↓  어댑터: 플랫폼 JSON → CanonicalEvent
L1 Observation (결정적 규칙 정규화, JSONL 원장)
  ↓  Claude 본체: 스킬 호출 (`/cfgm-process`)
L2 Flow Block (Goal/Cause/Action/Evidence/Outcome)  ← Phase 2
  ↓
L3 Problem Ontology (problem-id 범위 micro-ontology) ← Phase 4
  ↓
L4 Governance (시간/검증/승격/망각)                   ← Phase 6
```

경계선 원칙: **L0→L1은 훅**(빠르고 결정적), **L2 이상은 Claude 본체**(지능).

### 3.3 Canonical Event 스키마

```typescript
type CanonicalEvent = {
  platform: 'claude-code' | 'codex' | string;
  stage:
    | 'session-start' | 'prompt-submit'
    | 'tool-pre' | 'tool-post'
    | 'compact-pre' | 'session-end' | 'stop';
  sessionId: string;
  cwd: string;
  timestampIso: string;
  payload: StageSpecificPayload;  // discriminated union per stage
  raw: unknown;                    // 원본 JSON 보존 (역추적)
  adapterVersion: string;          // "claude-code@1.x"
};
```

어댑터 책임: 플랫폼 stdin JSON → `CanonicalEvent` 매핑 + 필드 보존. 이 타입만 안정되면 새 플랫폼은 어댑터 1개 추가로 지원.

---

## 4. 파일 스코프 & 경로 표준

### 4.1 사용자 레벨 (`$CFGM_HOME`, 기본 `~/.memory-brain/`)

크로스-프로젝트 자산. 민감도 낮음.

```
~/.memory-brain/
├─ identity/                       사용자 프로필
├─ learning/                       크로스-프로젝트 패턴 · 단서 카드
├─ ontologies/promoted/            승격된 온톨로지 모듈
├─ security/
│  ├─ hook-errors.jsonl            훅 실패 로그
│  ├─ redacted.jsonl               민감 정보 필터 매칭 기록
│  └─ storage-stats.jsonl          저장소 크기 주간 스냅샷
└─ patterns.override.yaml          사용자 커스텀 민감 패턴 (optional)
```

### 4.2 프로젝트 레벨 (`$PROJECT_ROOT/.memory-brain/`)

문제별 데이터. 민감할 수 있음.

```
$PROJECT_ROOT/.memory-brain/
├─ state/
│  ├─ active-problem.json
│  ├─ active-session.json
│  └─ current-gaps.json
├─ ledger/
│  ├─ raw/YYYY/MM/DD/session-<id>.jsonl         append-only 영구
│  ├─ curated/YYYY/MM/DD/observations.jsonl     Claude 본체 처리 후
│  ├─ pending-analysis.jsonl                    대기 큐 (7일 TTL)
│  ├─ expired-analysis.jsonl                    만료 아카이브
│  ├─ questions/{asked,pending}.jsonl           Phase 3
│  └─ compaction/YYYY/MM/DD/*.yaml              Phase 5
├─ problems/problem-<id>/
│  ├─ problem.yaml
│  ├─ flow-graph.json                           Phase 2
│  ├─ ontology.module.yaml                      Phase 4
│  ├─ claims.jsonl                              Phase 3
│  └─ evidence/
└─ ontologies/modules/                          프로젝트 전용
```

### 4.3 플랫폼 브리지

```
~/.claude/skills/CFGM-OS/         → symlink to $REPO/skill/
~/.claude/settings.json           → install.ts가 hooks 항목만 추가
```

### 4.4 `.gitignore` 템플릿 (프로젝트용)

```gitignore
# memory-brain: 기본은 모두 로컬. 공유할 것만 주석 해제.
.memory-brain/memory/ledger/raw/
.memory-brain/memory/ledger/curated/
.memory-brain/memory/ledger/pending-analysis.jsonl
.memory-brain/memory/ledger/expired-analysis.jsonl
.memory-brain/memory/state/
.memory-brain/memory/security/

# 팀 공유 권장 (opt-in)
# !.memory-brain/memory/problems/*/problem.yaml
# !.memory-brain/memory/problems/*/ontology.module.yaml
# !.memory-brain/memory/ontologies/modules/
```

원칙: **증거는 로컬, 구조는 선택 공유**.

---

## 5. 에픽 구조 (전체 6+2)

각 에픽은 상위 목표 · DoD · 의존성을 가진다. Phase 1(Epic 0 + Epic 1)만 스토리 상세화. 나머지는 진입 시점에 재-브레인스톰.

### Epic 0 — Dev Infrastructure (크로스컷)
- **목표**: 모든 에픽이 공유하는 기반(설치·테스트·CI·런타임 계약)
- **DoD**: `bin/install.ts`·`bun test`·fixture 하니스·Storage 인터페이스·CanonicalEvent + 어댑터 매퍼 동작
- **의존성**: 없음

### Epic 1 — Hook-native Ledger MVP (PRD Phase 1)
- **목표**: 훅이 살아서 raw event를 JSONL에 append하고 active-problem state 유지
- **DoD**: 5개 훅 동작 + raw ledger 누적 + pending 큐 + E2E 통합 테스트
- **의존성**: Epic 0

### Epic 2 — Flow Graph Engine (PRD Phase 2)
- **목표**: observation을 flow block으로 구조화, 문제별 그래프 유지
- **DoD**: `general-task` 템플릿 + `cfgm-ingest-observations` 스킬 + `flow-graph.json` 갱신 + cue card 자동 생성
- **의존성**: Epic 1

### Epic 3 — Gap Question Engine (PRD Phase 3)
- **목표**: 결손/stale 탐지 + VOI 스코어링 + 최우선 질문 1개 주입
- **DoD**: 결손 규칙 · VOI 공식 · asked/pending.jsonl · UserPromptSubmit 주입 · 중복 억제
- **의존성**: Epic 2

### Epic 4 — Micro Ontology Compiler (PRD Phase 4)
- **목표**: 다중 flow 템플릿(`bugfix`, `architecture` 등) · 동적 micro-ontology · 승격 레지스트리
- **DoD**: 템플릿 YAML 스키마 · 문제 유형 분류(Claude 본체) · `ontology.module.yaml` · `minResolvedRuns: 3` 승격
- **의존성**: Epic 2, 3

### Epic 5 — Compaction Survival (PRD Phase 5)
- **목표**: PreCompact 훅에서 그래프 델타·미해결 gap·다음 질문을 보존, SessionStart에서 복원
- **DoD**: resume-sheet 생성 · 복원 시나리오 통합 테스트
- **의존성**: Epic 2, 3

### Epic 6 — Governance (PRD Phase 6)
- **목표**: 시간 decay · shacl-lite 검증 · 충돌 해결 · 수동 리뷰 · 90일 rotation
- **DoD**: validator · `/cfgm-sweep` · supersededBy 체인 · `.archive/` 이동
- **의존성**: Epic 4, 5

### Epic 7 — Codex Adapter (플랫폼 확장)
- **목표**: Codex CLI에서 동일 코어가 작동 · 메모리 크로스-플랫폼 공유
- **DoD**: `adapters/codex/` · Codex fixture · `--platform=codex` 설치 · 크로스-플랫폼 smoke
- **의존성**: Epic 1~3 (병렬 가능)

### 의존 그래프

```
Epic 0 ─┬─ Epic 1 ─┬─ Epic 2 ─┬─ Epic 3 ─┬─ Epic 4 ─┐
        │          │          │          │          │
        │          │          │          └─ Epic 5 ─┼─ Epic 6
        │          │          │                     │
        └──────────┴──────────┴── Epic 7 (병렬) ─────┘
```

---

## 6. Phase 1 상세 스토리 (총 18개)

각 스토리: 산출물 · DoD · 테스트 타겟 · 의존성. 스토리 1개 = 0.5~1일(TDD 포함) 크기.

### Epic 0. Dev Infrastructure

#### E0-S1 — Bun 프로젝트 초기화
- **산출물**: `package.json`, `tsconfig.json`, `bunfig.toml`, 디렉터리 스켈레톤(`core/`, `adapters/`, `bin/`, `skills/`, `fixtures/`, `tests/`)
- **DoD**: `bun install` 성공, `bun run typecheck` 통과
- **테스트**: `tests/smoke/setup.test.ts` — 디렉터리 존재 검증
- **의존성**: 없음

#### E0-S2 — Storage 인터페이스
- **산출물**: `core/storage/Storage.ts` (인터페이스), `core/storage/FsStorage.ts`, `core/storage/MemoryStorage.ts`
- **메서드**: `appendJsonl`, `readJson`, `writeJsonAtomic`, `listFiles`, `exists`
- **DoD**: 두 구현이 동일 계약 테스트(contract test) 통과
- **테스트**: `tests/core/storage/*.test.ts` — read/write/concurrent append 18 케이스
- **의존성**: E0-S1

#### E0-S3 — CanonicalEvent 타입 & 유틸
- **산출물**: `core/events/CanonicalEvent.ts`, `core/events/stages.ts`, `core/events/guards.ts`
- **DoD**: discriminated union 빌드 · 타입가드 단위 테스트
- **테스트**: `tests/core/events/*.test.ts`
- **의존성**: E0-S1

#### E0-S4 — Claude Code 어댑터 매퍼
- **산출물**: `adapters/claude-code/hook-runner.ts`, `adapters/claude-code/mapper.ts`, `fixtures/claude-code/*.json` × 10 (SessionStart/PromptSubmit/PreTool×3/PostTool×3/PreCompact/SessionEnd)
- **DoD**: 모든 fixture에 대해 `mapper(json) → CanonicalEvent` 스냅샷 테스트 통과
- **테스트**: `tests/adapters/claude-code/mapper.test.ts`
- **의존성**: E0-S3

#### E0-S5 — 설치/제거 스크립트
- **산출물**: `bin/install.ts`, `bin/uninstall.ts`
- **기능**: `~/.claude/settings.json`의 `hooks` 섹션을 **기존 항목 보존하며 merge**, 심볼릭 링크 `~/.claude/skills/CFGM-OS → $PWD/skill/`, 역작업
- **DoD**: 재실행 멱등성(중복 없음), uninstall 시 자기 기여분만 제거
- **테스트**: tmpdir에 가짜 HOME + settings.json → 설치→제거→설치→제거 시나리오
- **의존성**: E0-S2

#### E0-S6 — 테스트 하니스 & fixture 로더
- **산출물**: `tests/helpers/fixture.ts`, `tests/helpers/tmpenv.ts` (tmpdir + env 자동 teardown)
- **DoD**: `bun test` 한 줄 전체 실행, 커버리지 리포트
- **의존성**: E0-S2, E0-S4

#### E0-S7 — `.gitignore` 템플릿 & README quickstart
- **산출물**: `.gitignore` + `templates/project-gitignore.txt`, `README.md` (설치·제거·테스트·아키텍처 1-page)
- **DoD**: 첫 사용자가 5분 내 설치·smoke 성공
- **의존성**: E0-S5

### Epic 1. Hook-native Ledger MVP

#### E1-S1 — Raw Ledger Writer
- **산출물**: `core/ledger/RawLedger.ts`
- **기능**: `~/.memory-brain/` / `$PROJECT/.memory-brain/` 자동 선택, `YYYY/MM/DD/session-<id>.jsonl` append-only, 이벤트 해시
- **DoD**: 10MB 초과 파일 분할 · 동시 append 원자성 · 재시작 후 읽기 검증
- **테스트**: 100 이벤트 동시 쓰기, 프로세스 재시작 복구
- **의존성**: E0-S2

#### E1-S2 — Active Problem State 관리자
- **산출물**: `core/binder/ActiveProblemStore.ts`
- **기능**: `active-problem.json` R/W, UUID+slug로 새 problem 생성, 전환, 히스토리
- **DoD**: atomic write(tmp+rename), 경쟁 시 병합 로그
- **테스트**: 전환 시나리오 5종, 프로세스 크래시 복구
- **의존성**: E0-S2

#### E1-S3 — Observation Normalizer (결정적)
- **산출물**: `core/normalizer/ObservationNormalizer.ts`
- **기능**: Edit/Write → `filesTouched`, Bash → `command + exitCode`, Read → `filesRead`, 사용자 프롬프트 → `userIntentRaw`. 민감 패턴은 `security/redacted.jsonl`로 분기 + 본문 마스킹
- **DoD**: PRD §11.2 Observation 형식 준수
- **테스트**: 12종 이벤트 fixture 스냅샷
- **의존성**: E0-S3, E1-S1

#### E1-S4 — Pending Analysis Queue + TTL Expirer
- **산출물**: `core/ledger/PendingQueue.ts`, `core/ledger/Expirer.ts`
- **기능**: `pending-analysis.jsonl` append, 7일 경과 항목을 `expired-analysis.jsonl`로 이동
- **DoD**: TTL 경계 테스트, raw 원본 보존 검증, 주입 가능한 Clock 인터페이스
- **테스트**: 과거/현재 섞인 fixture로 경계 검증
- **의존성**: E0-S2

#### E1-S5 — SessionStart 훅
- **산출물**: `hooks/SessionStart/10_load_state.ts`, `hooks/SessionStart/90_emit_context.ts`
- **기능**: active-problem + open gaps + pending 요약을 stdout으로 markdown 주입 (2KB 이내)
- **DoD**: 300ms 이내, 빈 상태 / 복원 / 만료 pending 처리 3 시나리오
- **테스트**: stdout 스냅샷
- **의존성**: E1-S1~S4, E0-S4

#### E1-S6 — UserPromptSubmit 훅
- **산출물**: `hooks/UserPromptSubmit/10_parse_intent.ts`, `hooks/UserPromptSubmit/90_emit_hints.ts`
- **기능**: active-problem 요약 + 최상위 pending 질문 1개 주입 (Problem 전환 판단은 Claude 본체에 위임)
- **DoD**: asked.jsonl에 이미 있는 질문은 스킵
- **테스트**: 동일 질문 연속 차단 시나리오
- **의존성**: E1-S2, E0-S3

#### E1-S7 — PreToolUse 훅
- **산출물**: `hooks/PreToolUse/10_security_gate.ts`, `hooks/PreToolUse/20_capture.ts`
- **기능**: raw ledger append(pre 마커), 위험 명령 경고(MVP: `rm -rf`, `sudo`), post-phase와 페어링용 `correlationId` 발급
- **DoD**: correlation 페어링 성립
- **테스트**: correlation 페어링 단위 테스트
- **의존성**: E1-S1

#### E1-S8 — PostToolUse 훅
- **산출물**: `hooks/PostToolUse/10_capture.ts`, `hooks/PostToolUse/20_normalize.ts`, `hooks/PostToolUse/30_pending_queue.ts`
- **기능**: raw append + normalizer 호출 + 애매한 이벤트는 pending 큐 enqueue
- **DoD**: Claude Code 툴 8종(Edit/Write/Read/Bash/Glob/Grep/WebFetch/Task) 대응
- **테스트**: 8종 각 스냅샷
- **의존성**: E1-S1, E1-S3, E1-S4, E1-S7

#### E1-S9 — SessionEnd 훅
- **산출물**: `hooks/SessionEnd/10_finalize.ts`
- **기능**: 세션 종료 마커, pending 요약, active-problem `lastConfirmedAt` 갱신
- **DoD**: idempotent(비정상 종료에도 안전)
- **테스트**: 중단 후 재시작 시나리오
- **의존성**: E1-S1, E1-S2

#### E1-S10 — 슬래시 커맨드 스킬
- **산출물**: `skills/cfgm-new-problem/SKILL.md`, `skills/cfgm-switch/SKILL.md`, `skills/cfgm-process/SKILL.md`, `skills/cfgm-requeue/SKILL.md`
- **기능**: Claude 본체가 호출 시 수행할 파일 조작 지침. 필요 시 `bin/cfgm-*.ts` 헬퍼 CLI
- **DoD**: 각 스킬 SKILL.md 1개 + CLI(있다면) 단위 테스트
- **테스트**: CLI 직접 호출로 파일 상태 검증
- **의존성**: E1-S2, E1-S4

#### E1-S11 — E2E 통합 테스트 (골든 패스)
- **산출물**: `tests/e2e/phase1-golden-path.test.ts`
- **시나리오**: 빈 상태 → SessionStart → 프롬프트 → Edit → Bash → PostToolUse 정규화 → pending 확인 → `/cfgm-process` 시뮬레이션 → SessionEnd → 파일 상태 스냅샷
- **DoD**: fixture 15 이벤트 체인 성공, 재실행 결정성
- **의존성**: E1-S1~S10 전부

---

## 7. 구현 직전 선결정 핵심 이슈

스펙에 명문화, 구현 중 재토론 금지.

### 7.1 동시성
- JSONL append: POSIX `O_APPEND` 원자성(≤4KB 메시지)
- State 파일: tmp + atomic rename
- 다중 Claude 세션 동일 프로젝트 실행 허용. 동일 `active-problem.json` 경쟁 시 최신 승 + 충돌 로그

### 7.2 훅 실패 모드
- **exit ≠ 0 금지**(Claude Code 메인 차단 위험)
- 타임아웃 300ms 초과 → 조용히 종료, `security/hook-errors.jsonl` 기록
- 훅 크래시가 다음 훅 실행에 무영향

### 7.3 민감 정보 필터 (raw 쓰기 직전)
- 정규식: OpenAI/Anthropic key, AWS key, JWT, `password=`, (옵션) 이메일
- 매치 → 본문 `<REDACTED:reason>` 치환 + `security/redacted.jsonl` 기록
- 기본 패턴: `core/security/patterns.ts`. 사용자 오버라이드: `$CFGM_HOME/security/patterns.override.yaml`

### 7.4 훅 실행 순서
- `settings.json`의 hooks 배열 순서
- `install.ts`가 `10_*.ts → 90_*.ts` 접두사 정렬로 배열 생성
- 사용자 수동 편집 불필요

### 7.5 경로 충돌 회피
- 훅 실행 파일: `~/.claude/skills/CFGM-OS/hooks/` (절대 `~/.claude/hooks/` 사용 안 함)
- 기존 사용자 훅·스킬 보존
- `install.ts`는 settings.json 기존 항목 보존, 자기 항목만 추가/제거

### 7.6 버전 락
- `adapters/claude-code/VERSION`에 지원 버전 범위
- fixture는 버전별 디렉터리(`fixtures/claude-code/v1.x/...`)
- Claude Code 버전 변경 감지 시 SessionStart에 경고 주입

### 7.7 스토리지 성장
- Phase 1: 허용, 주간 크기 모니터링(`storage-stats.jsonl`)
- Phase 6에서 90일 rotation
- 예상 성장: dogfood 기준 ~5MB/일 · 3개월 ~450MB (압축 전)

### 7.8 SessionId 소스
- Claude Code 훅 이벤트의 `session_id`를 어댑터가 그대로 전달
- Codex는 어댑터 자체 매핑 (Epic 7)

### 7.9 첫 실행 부트스트랩
- 훅이 디렉터리 지연 생성(`mkdir -p`)
- 빈 상태 SessionStart: `### 🧠 memory-brain\n초기화됨. 대화를 계속하세요.`
- active-problem 생성은 Claude 본체가 `/cfgm-new-problem` 호출 시에만

### 7.10 stdout 컨텍스트 포맷
- markdown, 헤더 `### 🧠 memory-brain`로 시작(Claude 인지 용이)
- 길이 ≤ 2KB (토큰 절약)

---

## 8. TDD 규율

- **테스트 우선**: 모든 스토리는 실패하는 테스트 → 최소 구현 → 리팩터
- **코어(core/)**: 100% 순수 함수, Storage 주입으로 파일 시스템 격리
- **어댑터**: 플랫폼 fixture JSON에 대한 스냅샷 테스트
- **통합**: tmpdir 기반 실제 CLI 실행, 파일 상태 검증
- **러너**: `bun test`, Phase 1 라인 커버리지 ≥ 85%
- **스토리 완료 = 테스트 그린 + 수동 smoke 1회**

---

## 9. 진척 체크리스트

Phase 1 = Epic 0(7) + Epic 1(11) = **총 18 스토리**.

### Epic 0 — Dev Infrastructure
- [ ] E0-S1 Bun 프로젝트 초기화
- [ ] E0-S2 Storage 인터페이스
- [ ] E0-S3 CanonicalEvent 타입 & 유틸
- [ ] E0-S4 Claude Code 어댑터 매퍼
- [ ] E0-S5 설치/제거 스크립트
- [ ] E0-S6 테스트 하니스 & fixture 로더
- [ ] E0-S7 `.gitignore` 템플릿 & README quickstart

### Epic 1 — Hook-native Ledger MVP
- [ ] E1-S1 Raw Ledger Writer
- [ ] E1-S2 Active Problem State 관리자
- [ ] E1-S3 Observation Normalizer
- [ ] E1-S4 Pending Queue + TTL Expirer
- [ ] E1-S5 SessionStart 훅
- [ ] E1-S6 UserPromptSubmit 훅
- [ ] E1-S7 PreToolUse 훅
- [ ] E1-S8 PostToolUse 훅
- [ ] E1-S9 SessionEnd 훅
- [ ] E1-S10 슬래시 커맨드 스킬 4종
- [ ] E1-S11 E2E 통합 테스트 (골든 패스)

### Phase 2~ (에픽 단위, 진입 시 재-브레인스톰)
- [ ] Epic 2 Flow Graph Engine
- [ ] Epic 3 Gap Question Engine
- [ ] Epic 4 Micro Ontology Compiler
- [ ] Epic 5 Compaction Survival
- [ ] Epic 6 Governance
- [ ] Epic 7 Codex Adapter

---

## 10. 스펙 외 영역 (Out of Scope, Phase 1)

- Flow block 추출 (Epic 2)
- Gap detection / VOI (Epic 3)
- 다중 템플릿 · 문제 분류 (Epic 4)
- Compaction survival (Epic 5)
- Governance · rotation (Epic 6)
- Codex 어댑터 (Epic 7)
- 서버/daemon 기반 처리 (영구적으로 scope-out)
- 외부 API 호출 (영구적으로 scope-out)

---

## 11. 변경 이력

| 날짜 | 변경 | 근거 |
|---|---|---|
| 2026-04-17 | 초안 작성 | 브레인스톰 세션 완료 |

---

## 12. 다음 단계

1. 사용자가 본 스펙을 리뷰
2. 승인 시 `superpowers:writing-plans` 스킬로 구현 계획(step-by-step) 작성
3. 구현은 `superpowers:executing-plans`로 단계별 실행
4. 각 스토리 완료 시 본 문서 §9 체크리스트 갱신
