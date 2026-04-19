# CFGM-OS 아티팩트 인벤토리

> 최종 갱신: 2026-04-19  
> 기준 커밋: `a6bfe71` (feat(E4-S9): E2E golden path for Epic 4 ontology lifecycle)

---

## 완료된 에픽

### Epic 0 — Dev Infrastructure

| 아티팩트 | 경로 | 설명 |
|---|---|---|
| Storage 인터페이스 | `src/core/storage/Storage.ts` | `appendJsonl`, `readJson`, `writeJsonAtomic`, `listFiles`, `exists`, `readText`, `writeRaw`, `rewriteJsonl` |
| FsStorage | `src/core/storage/FsStorage.ts` | 파일시스템 구현체 |
| MemoryStorage | `src/core/storage/MemoryStorage.ts` | 인메모리 테스트용 구현체 |
| Clock 인터페이스 | `src/core/clock/Clock.ts` | `RealClock`, `FakeClock` |
| CanonicalEvent | `src/core/events/CanonicalEvent.ts` | discriminated union 이벤트 타입 |
| 이벤트 가드 | `src/core/events/guards.ts` | 타입 가드 함수 |

---

### Epic 1 — Observation Capture

| 아티팩트 | 경로 | 설명 |
|---|---|---|
| RawLedger | `src/core/ledger/RawLedger.ts` | JSONL append 원장 |
| Expirer | `src/core/ledger/Expirer.ts` | 만료 이벤트 처리 |
| PendingQueue | `src/core/ledger/PendingQueue.ts` | 미처리 이벤트 큐 |
| ObservationNormalizer | `src/core/normalizer/ObservationNormalizer.ts` | 훅 페이로드 정규화 |
| Redactor | `src/core/security/Redactor.ts` | 민감 정보 리댁션 |
| 보안 패턴 | `src/core/security/patterns.ts` | 리댁션 패턴 목록 |
| 훅: SessionStart | `src/hooks/session-start.ts` | 세션 시작 처리 |
| 훅: SessionEnd | `src/hooks/session-end.ts` | 세션 종료 처리 |
| 훅: PreToolUse | `src/hooks/pre-tool-use.ts` | 도구 사용 전 처리 |
| 훅: PostToolUse | `src/hooks/post-tool-use.ts` | 도구 사용 후 처리 |
| 훅: UserPromptSubmit | `src/hooks/user-prompt-submit.ts` | 사용자 프롬프트 처리 |
| install/uninstall | `bin/install.ts`, `bin/uninstall.ts` | Claude Code 훅 등록/해제 |

---

### Epic 2 — Flow Graph

| 아티팩트 | 경로 | 설명 |
|---|---|---|
| Flow 타입 | `src/core/flow/types.ts` | `FlowBlock`, `FlowDelta`, `FlowGraph`, `RelationKind` |
| FlowGraphStore | `src/core/flow/FlowGraphStore.ts` | 델타 append + 스냅샷 R/W |
| FlowGraphProjector | `src/core/flow/FlowGraphProjector.ts` | 델타 → 그래프 프로젝션 |
| FlowGraphValidator | `src/core/flow/FlowGraphValidator.ts` | 그래프 검증 |
| ObservationBundler | `src/core/flow/ObservationBundler.ts` | 관찰 번들 생성 |
| OrphanBundleManager | `src/core/flow/OrphanBundleManager.ts` | 고아 번들 처리 |
| CueCardInjector | `src/core/flow/CueCardInjector.ts` | CueCard stdout 주입 |
| CueCardFallback | `src/core/flow/CueCardFallback.ts` | CueCard 폴백 생성 |
| Flow 설정 | `src/core/flow/config.ts` | FLOW_CONFIG 상수 |
| CLI: cfgm-apply-delta | `bin/cfgm-apply-delta.ts` | 델타 적용 CLI |
| CLI: cfgm-inspect-graph | `bin/cfgm-inspect-graph.ts` | 그래프 조회 CLI |
| CLI: cfgm-list-bundles | `bin/cfgm-list-bundles.ts` | 번들 목록 CLI |

---

### Epic 3 — Gap & Question Engine

| 아티팩트 | 경로 | 설명 |
|---|---|---|
| Gap 타입 | `src/core/gap/types.ts` | `GapCandidate`, `QuestionLifecycle`, `PendingQuestionRecord` 등 |
| Gap 가드 | `src/core/gap/guards.ts` | 타입 가드 |
| GapAnalyzer | `src/core/gap/GapAnalyzer.ts` | 8개 감지기 오케스트레이션 |
| VoiScorer | `src/core/gap/VoiScorer.ts` | Value-of-Information 점수 계산 |
| QuestionQueue | `src/core/gap/QuestionQueue.ts` | pending/asked 질문 큐 |
| QuestionLifecycleResolver | `src/core/gap/QuestionLifecycleResolver.ts` | 질문 라이프사이클 전환 |
| 8개 Detector | `src/core/gap/detectors/` | OrphanAction, UnsupportedHypothesis, StaleConfirmed, UncausedProblem, LowConfidenceCritical, ConflictingOutcomes, DanglingEvidence, UnmitigatedCause |
| CLI: cfgm-list-gaps | `bin/cfgm-list-gaps.ts` | 갭 목록 CLI |
| CLI: cfgm-requeue | `bin/cfgm-requeue.ts` | 질문 재큐 CLI |

---

### Epic 4 — Micro Ontology Compiler

| 아티팩트 | 경로 | 설명 |
|---|---|---|
| Ontology 타입 | `src/core/ontology/types.ts` | `FlowTemplate`, `OntologyModuleData` |
| TemplateRegistry | `src/core/ontology/TemplateRegistry.ts` | YAML 템플릿 로더 (Storage DI) |
| OntologyModule | `src/core/ontology/OntologyModule.ts` | per-problem YAML R/W (`problems/<id>/ontology.module.yaml`) |
| PromotionEngine | `src/core/ontology/PromotionEngine.ts` | resolvedRuns >= 3 → userStorage 승격 |
| 플로우 템플릿 | `flow-patterns/general-task.yaml`, `bugfix.yaml`, `architecture.yaml` | 기본 3개 템플릿 |
| CLI: cfgm-ontology-record | `bin/cfgm-ontology-record.ts` | 패턴 기록 + resolve CLI |
| SessionStart 통합 | `src/hooks/session-start.ts` | 템플릿 정보 읽기 전용 주입 |
| ActiveProblemStore 연동 | `src/core/binder/ActiveProblemStore.ts` | create() 시 OntologyModule 자동 초기화 |

---

## 진행 중인 에픽

### Epic 5 — Compaction Survival (설계 중)

- **목표**: PreCompact 훅에서 그래프 델타·미해결 gap·다음 질문을 resume-sheet로 보존, SessionStart에서 복원
- **결정된 사항**:
  - resume-sheet 저장 위치: `state/resume-sheet-<sessionId>.json` (세션 스코프)
  - 복원 방식: consume-once (SessionStart에서 읽고 즉시 삭제)
  - 아키텍처: ResumeSheetWriter 서비스 클래스 분리 (추천안 A)
- **상태**: 브레인스토밍 진행 중 → 스펙 작성 예정

---

## 미착수 에픽

| 에픽 | 목표 | 의존성 |
|---|---|---|
| Epic 6 — Governance | 시간 decay · shacl-lite 검증 · 충돌 해결 · 90일 rotation | Epic 4, 5 |
| Epic 7 — Codex Adapter | Codex CLI 크로스-플랫폼 지원 | Epic 1~3 |

---

## 테스트 현황

- **전체 통과**: 332개 (Epic 4 완료 기준)
- **TypeScript**: `bun run typecheck` 클린
- **패턴**: contract test (Storage), unit test (각 서비스), E2E golden path (Epic 4)
