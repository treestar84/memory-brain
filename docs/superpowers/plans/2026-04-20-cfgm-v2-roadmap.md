# CFGM-OS v2 Roadmap — Epic 7 ~ Epic 14

작성: 2026-04-20
근거: `2026-04-20-cfgm-v2-rfc.md`, T2 §9, T3, T4 §C, T5 synthesizer 주문

---

## 0. 총괄

| Epic | 제목 | 기간 | 의존 | 산출 테스트 |
|---|---|---|---|---|
| **Epic 12a** | **Install hygiene (install.ts Stop 수정 + manifest + CFGM:VERSION + resume)** — **DX 선행 분할, 본 리포 구현 완료** | **3일** | — | **+5 (439 baseline)** |
| Epic 7 | Temporal Curator + decayPolicy | 1주 | E12a | +12 |
| Epic 8 | VoiLearner + voi-feedback ledger | 1.5주 | E7 | +19 |
| Epic 9 | QuestionBundler + FatigueModel + AnswerQualityScorer | 2주 | E8 | +38 |
| Epic 10 | SkillProjector + KGSkillBridge + IntentClassifier + flow-pattern v2 | 2주 | E7 | +31 |
| Epic 11 | OntologyAnonymizer + PromotionEngineV2 + ExportBundle skeleton | 1.5주 | E7 | +18 |
| Epic 12b | `/cfgm-doctor` `/cfgm-setup` `/cfgm-hud` + migrate 1→2 + rollback (Epic 12에서 분리된 skill/CLI 층) | 1.5주 | E7~E11 | +18 회귀 |
| Epic 13 | **PAI Synthesizer L3~L5** (Distiller + Skill Synth + G1~G4 gates) | 2주 | E10 | 선결 조건 G1~G4 |
| Epic 14 | Benchmarks (LongMemEval / LoCoMo 실측 게시) | 0.5주 | Post-GA | 별도 `docs/benchmarks/` |

**Sequential 합계**: Epic 12a 3일 + Epic 7~13 9주. Epic 14는 M-V2.0 GA 이후 별도 진행. **E8~E9 / E10~E11 병렬 시 약 6주**. Epic 13은 Epic 10 완료 후 착수. Epic 12a는 ADR-v2-001 (DX 선행 분할) 근거 참조.

```
Epic 7 (1w) ──┬── Epic 8 (1.5w) ── Epic 9 (2w) ──┐
              ├── Epic 10 (2w) ────┬─────────────┼── Epic 12 (1.5w)
              ├── Epic 11 (1.5w) ──┤             │
              └────────────────────┴── Epic 13 (2w, E10 후)
```

Tests 최종: **439 (Epic 0~6 434 + Epic 12a +5) + 118 (v2 신규) + 18 (회귀 가드) = 575**. (구 문서 수치 411은 Epic 5 당시 베이스라인; 실제 Epic 6 완료 후 434, Epic 12a 완료 후 439.)

---

## 1. Epic 7 — Temporal Curator

**목표**: `staleAfter` 단일 timestamp에서 `decayPolicy`(step/exponential/hardAt) + per-blockType half-life + confidence decay + clock-skew detection 체계로 확장.

### 1.1 구현 항목
- `src/core/temporal/TemporalCurator.ts`: SessionStart에서 sweep + confidence × half-life decay 계산
- `state/temporal-policy.json`: `{ "Evidence": { halfLifeDays: 14 }, "Hypothesis": { halfLifeDays: 7 }, ... }` 기본값
- `StaleDecayEngine.sweep()` 확장: `decayPolicy` 있으면 half-life 기반, 없으면 v1 `staleAfter` path (default fallback)
- FlowBlock 옵셔널 필드 추가: `lastQueriedAt`, 그리고 clock-skew 검출 시 `security/time-anomaly.jsonl` 기록

### 1.2 테스트 (+12)
- half-life decay 수학 (3)
- v1 fallback byte-equal (3)
- clock-skew 기록 + sweep skip (2)
- session-start integration (2)
- v1 fixture 회귀 (2)

### 1.3 수용 조건
- `decayPolicy` 없는 v1 fixture에서 기존 439 tests green (Epic 6 434 + Epic 12a +5)
- `sweep()` 호출 후 `confidence`가 half-life 수식대로 감쇠됨을 테스트로 증명
- 시간 역행 주입 시 `security/time-anomaly.jsonl` append 확인
- **SessionStart 예산(Critic T11 조건 #1)**: hydration 포함 wall-clock ≤ 500ms (p95), hydration payload ≤ 8KB. p95 초과 시 요약 모드(top-1 graph only + gap questions off)로 degrade. `bench/session-start.bench.ts`로 CI 회귀 가드

### 1.4 위험
- Clock 주입 테스트 누락 시 회귀 발생 → Clock 추상화 Epic 0 재사용 확인 필수

---

## 2. Epic 8 — VoiLearner + voi-feedback ledger

**목표**: K-1 정적 `VOI_WEIGHTS` 폐기. Thompson sampling per-detector posterior으로 학습.

### 2.1 구현 항목
- `src/core/gap/VoiLearner.ts`: Beta(α,β) posterior, epsilon-greedy 5%
- `state/voi-weights.json`: `{ detectorPosteriors, featureWeights, updatedAt }`
- `ledger/voi/YYYY/MM/DD/feedback.jsonl`: VoiFeedbackRecord append
- `VoiScorer.score()` 시그니처 유지, 내부에서 VoiLearner 호출
- **default-off flag**: `config.VOI_LEARNING_ENABLED`(기본 false) — 439 tests 보호

### 2.2 테스트 (+19)
- posterior 업데이트 수학 (4)
- epsilon-greedy exploration 비율 (2)
- default-off 경로 v1 byte-equal (5)
- feedback ledger append (3)
- PreCompact 스냅샷 포함 (2)
- end-to-end (3)

### 2.3 수용 조건
- `VOI_LEARNING_ENABLED=false`에서 기존 VoiScorer 테스트 모두 green
- `VOI_LEARNING_ENABLED=true`에서 feedback 1000건 주입 후 posterior가 shape(α,β) 수렴

### 2.4 위험
- 조기 수렴 (R1) → epsilon-greedy 필수, Canary phase에서 posterior 초기화 정책 문서화

---

## 3. Epic 9 — QuestionBundler + FatigueModel + AnswerQualityScorer

**목표**: 진화축 #2 핵심. 질문 타이밍·번들·우선순위·답변 학습 루프 닫기.

### 3.1 QuestionBundler
- `src/core/gap/QuestionBundler.ts`
- `bundle(pending, activeProblemId, askedSet, fatigue, budget)` → Bundle | null
- 같은 subjectBlockId/detectorId 우선 묶음, VOI 내림차순 budget 만족까지
- **budget.maxQuestions=1** 호출 시 v1 `injectQuestion()` 동치 (회귀 가드)

### 3.2 FatigueModel
- `src/core/gap/FatigueModel.ts` + `state/question-fatigue-<sessionId>.json`
- 연속 3회 무시 → cooldown 30분
- session 당 budget 기본 5
- 디버깅 모드(Bash exit≠0 연속 3턴) → budget ×2

### 3.3 AnswerQualityScorer
- `src/core/gap/AnswerQualityScorer.ts`
- 3-조건 검사 → outcome ∈ {answered-quality, answered-noise, ignored, rejected}
- `/cfgm-process` 후속 단계로 호출, `ledger/voi/.../feedback.jsonl` append

### 3.4 테스트 (+38)
- QuestionBundler (15): budget=1 동치 가드(5) + multi-question 번들링(5) + rationale(2) + fatigue 연동(3)
- FatigueModel (10): cooldown 30분(3) + debugging mode boost(3) + session reset(2) + ledger persistence(2)
- AnswerQualityScorer (13): 3-조건(4) + 블록 인접 체크(3) + provenance 증가(2) + feedback append(4)

### 3.5 수용 조건
- `UserPromptSubmit` end-to-end: 3회 무시 후 cooldown 30분 동안 질문 inject 0건
- 디버깅 모드에서 budget 2배 확장 검증
- answered-quality → posterior α 증가, ignored → β 증가 (VoiLearner 통합)

---

## 4. Epic 10 — SkillProjector + KGSkillBridge + IntentClassifier + flow-pattern v2

**목표**: 진화축 #1 핵심. KG가 암묵 스킬로 작동.

### 4.1 flow-pattern v2 스키마
- `flow-patterns/*.yaml` v2 필드 추가: `intent`, `preconditions`, `steps[]`, `successCriteria`, `fallback`
- v1 reader는 누락 필드를 기본값으로 hydrate
- `general-task.yaml` + `bugfix.yaml`(신규) + `architecture.yaml`(신규) 세 템플릿 v2 전환
- **dead templateId 활성화**: `ActiveProblemStore.ts:67` "general-task" 고정 → intent 분류 기반 자동 선택

### 4.2 IntentClassifier
- `src/core/intent/IntentClassifier.ts`
- 정규식 + keyword (LLM 호출 금지, D1 원칙)
- input: UserPromptSubmit prompt. output: {intent, confidence}

### 4.3 SkillProjector
- `src/core/skill-proj/SkillProjector.ts`
- `projectForSession(activeProblemId, promptIntent)` → SkillProjection[]
- hydratedFrom: `{templateId, ontologyModuleId, skillBlockId}`
- SessionStart(session-start.ts:131 직후) + UserPromptSubmit 내부 단계에서 호출
- **주입 방식**: fenced code block + NL hint (K-5 dual-channel)

### 4.4 KGSkillBridge
- `src/core/skill-proj/KGSkillBridge.ts`
- IntentClassifier → SkillProjector 호출 orchestration
- confidence<0.6 inject 차단 (R2 완화)
- reject 시 30일 cooldown (per-skillId)

### 4.5 테스트 (+31)
- SkillProjector (18): projection 생성(6) + hydratedFrom 추적(3) + ontology 병합(4) + byte-budget 보호(3) + 회귀 가드(2)
- KGSkillBridge + IntentClassifier (13): intent 분류(5) + confidence gate(3) + cooldown(3) + end-to-end(2)

### 4.6 수용 조건
- "버그가 났는데"로 시작한 turn에서 bugfix projection이 주입됨을 통합 테스트로 증명
- confidence<0.6 주입 0건 (fuzzing 테스트)
- 30일 cooldown 기간 중 inject 0건
- **SessionStart 예산(Critic T11 조건 #1)**: SkillProjector inject + hydration wall-clock ≤ 500ms (p95), hydration payload ≤ 8KB. p95 초과 시 projection 생략 degrade

### 4.7 위험
- 잘못된 projection inject로 사용자 혼란 (R2) → canary 모드에서만 시작, 14일 observation 후 default-on

---

## 5. Epic 11 — OntologyAnonymizer + PromotionEngineV2

**목표**: K-2 `minResolvedRuns=3` 폐기. 거대 온톨로지 export skeleton (진화축 #3 Future Work용 기반).

### 5.1 OntologyAnonymizer
- `src/core/ontology/Anonymizer.ts`
- `v1-deterministic-hash`: HMAC-SHA256(secret, problemId) — 디폴트
- HMAC secret은 설치 시 생성 후 `~/.claude-brain/secrets/anonymizer.key` 로컬 저장 (R3)

### 5.2 PromotionEngineV2
- 4-signal gate: `runs≥5 + stable≤0.2 + diverse≥0.3 + userConfirmed` 중 **3 이상**
- staged → user confirm CLI(`/cfgm-promote-confirm <id>`) → promoted/v2/<anonymizedId>.yaml
- v1 fixture fallback: 새 시그널 없으면 `runs≥3`만 체크 (BC 보호)

### 5.3 ExportBundle skeleton
- `ontologies/exports/<timestamp>.json` 스키마 정의
- 실제 export UI/CLI는 **Future Work** (Epic 13+) — 본 Epic에서는 JSON writer만

### 5.4 테스트 (+18)
- OntologyAnonymizer (10): HMAC 결정론(3) + k-anonymity skeleton(2) + secret 관리(3) + PII 유출 0건(2)
- PromotionEngineV2 (8): 4-signal 통합(4) + v1 fallback(2) + staged 경로(2)

### 5.5 수용 조건
- PII 유출 0건 (grep 기반 redaction 테스트)
- v1 fixture 회귀 green
- `promoted/v2/` 파일의 problemId가 원본과 무관한 hash임을 검증

---

## 6. Epic 12 — Distribution DX (P0 필수)

**목표**: Critic 주문 #5 — OMC/OMX 수준 운영 도구. `/cfgm-doctor` `/cfgm-setup` `/cfgm-hud` 3 스킬 + install dry-run/rollback.

### 6.1 install/uninstall 재설계
- K-4 수용: `install.ts` deprecate, `install-brain.ts` 단일화
- marker 통일: `cfgm-os-brain`
- 5대 원칙: version-marked merge / phase-checkpointed / transactional staging / managed-file whitelist / preflight conflict
- `install-manifest.json`: `{cfgmVersion, files[], hooksRegistered[], hashChecksums}`
- `install-progress.json`: `{phase, completedSteps[], startedAt, pid}` (resume 지원)

### 6.2 프로파일 모델 구현
- `~/.claude-brain/profiles/user.json`, `team/<slug>/policy.json`
- 프로젝트별 `.memory-brain/profile.json`
- priority: project > user > team
- cross-harness adapter: `adapters/{claude,codex,gemini}.json`

### 6.3 `/cfgm-doctor`
- 12행 체크 리포트 (§T4 C-3)
- `omc-doctor/SKILL.md:120-148` 포맷 차용: Check/Status/Details + Issues + Recommended Fixes + y/n auto-fix

### 6.4 `/cfgm-setup`
- Unified router: `/cfgm-setup {full|doctor|--local|--global|migrate|adopt|--help}`
- Phase 파일: `skills/cfgm-setup/phases/{01-preflight,02-staging,03-commit,04-welcome}.md`
- Onboarding 4단계 tutorial (T4 C-6)

### 6.5 `/cfgm-hud`
- Object form statusLine + safeMode ASCII fallback
- 프리셋: minimal/focused(기본)/full
- 임계값: drift_score>0.3, synth_rejection_rate>0.8, identity_bytes>20KB, pending_bundles>10
- 구현: `~/.claude-brain/hud/cfgm-hud.mjs` + 300ms TTL 캐시

### 6.6 E-code 10종 카탈로그
E001~E010 (T4 C-7) 재현 테스트 존재 강제

### 6.7 엣지케이스 8종 복구 경로
EC-1~EC-8 (T4 §D, RFC §15) 각각 통합 테스트

### 6.8 테스트 (+18 회귀 가드 + 도구별 단위)
- install/uninstall 멱등성 (5): version 동일 시 파일 hash-equal
- 부분 실패 복구 (5): perm/parse/sig/disk-full/lock 각각 1회 복구 HEALTHY
- E-code 재현 (10): 각 E-code 트리거 및 복구 가능
- HUD 지연 ≤50ms (2)
- doctor 오탐 0 (2)

### 6.9 수용 조건
- 전체 439 + 신규 테스트 그대로 green
- 재실행 멱등성 100%
- 부분 실패 주입 후 복구 명령 1회로 HEALTHY ≥95%
- **SessionStart 예산(Critic T11 조건 #1)**: `/cfgm-doctor` 내 session-start-bench가 `wall-clock ≤ 500ms p95, payload ≤ 8KB` 확인. 초과 시 HUD에 WARN 표시 + 요약 모드 자동 전환 제안

---

## 7. Epic 13 — PAI Synthesizer L3~L5 (후속)

**목표**: T3 PAI v2 아키텍처 완성. 자동 관찰 → 패턴 증류 → 스킬 초안 → 사용자 승인.

### 7.1 L3 Behavior Ledger
- `identity-observations/YYYY-MM-DD.jsonl` append-only
- Source: post-tool-use, pre-tool-use, user-prompt-submit hook
- 30일 rotation

### 7.2 L4 Pattern Distiller
- `src/core/synth/Distiller.ts`
- 주간 크론 or 수동 `/cfgm-distill`
- output: `synthesizer/candidates/<id>.json`

### 7.3 L5 Skill Synthesizer
- `src/core/synth/Synthesizer.ts`
- 산출 3종: D-1 Skill markdown, D-2 Hook draft, D-3 Flow-pattern YAML
- 각 산출물 frontmatter 스키마 `cfgm-identity-bootstrap` 재사용

### 7.4 G1~G4 Gates
- G1 Evidence: candidate 자동 기각
- G2 Sandbox: `shadow-runs/<id>-<ts>.log` dry-run
- G3 User approval: AskUserQuestion y/n/edit, 48h 무응답 폐기
- G4 Canary: N=3 problem canary, override/rollback 1회 → quarantine

### 7.5 C1~C4 충돌 해결
- L1 drift-lock 키워드 대조
- 프로파일 스택 로딩 시 중복 감지
- identity.lock + mtime sha256 비교

### 7.6 측정 기준 (M1~M5)
- M1: 14일 내 ≥1 산출물 G1~G4 통과
- M2: 수동 편집률 <50%
- M3: Identity ≤20KB
- M4: L1 위반 반영 0건
- M5: Rollback ≤5초

---

## 8. 각 Epic 공통 산출물

- 구현 코드 + 단위/통합 테스트
- `docs/superpowers/plans/YYYY-MM-DD-cfgm-epicN-tasks.md` (세부 task 분해)
- ADR 필요 시 `docs/adr/00N-<topic>.md`
- `docs/handoff.md` / `docs/artifacts.md` 업데이트

---

## 9. 의존성 그래프

```
                    Epic 7 (Temporal)
                      │
          ┌───────────┼────────────┐
          │           │            │
       Epic 8      Epic 10       Epic 11
          │           │            │
       Epic 9         │            │
          │           │            │
          └───────────┴────────────┘
                      │
                   Epic 12 (DX)
                      │
                   Epic 13 (PAI L3~L5)
```

Epic 10 → Epic 13은 **hard dependency** (IntentClassifier가 Distiller의 입력).

---

## 10. 마일스톤

| 마일스톤 | Epic 완료 시점 | 검증 게이트 |
|---|---|---|
| M-V2.0-alpha | E7 + E8 + E10 완료 | 학습 VOI + SkillProjector default-off path 회귀 0 |
| M-V2.0-beta | E9 + E11 완료 | 질문 번들링 + promotion multi-signal 통합 green |
| M-V2.0 GA | E12 완료 | 멱등성 + 엣지케이스 8종 복구 테스트 100% pass |
| M-V2.1 | E13 완료 | G1~G4 게이트 14일 관측, M1~M5 측정 기준 충족 |

**Critic 주문 #6 수용**: LongMemEval/LoCoMo 벤치마크 숫자는 M-V2.0 GA 이후 별도 Epic(Epic 14)에서 `docs/benchmarks/` 생성 후 게시.

---

## 11. 비범위 (non-goals)

- JSON-LD/OWL 포맷 native 지원 (Epic 13+)
- cross-user aggregation UI (Epic 13+)
- LLM self-reorganization (Letta 패턴) — D1 원칙에 반함
- Anthropic Skills + memory tool 공식 API bridge (Future)
- Grafana/Prometheus 통합 (D2 telemetry-free 원칙)
- 웹 대시보드 (`/cfgm-hud` CLI statusline으로 충분)

---

## 12. 참고
- RFC: `docs/superpowers/specs/2026-04-20-cfgm-v2-rfc.md`
- Distribution-DX: `docs/superpowers/specs/2026-04-20-cfgm-v2-distribution-dx.md`
- Invention Claims: `docs/superpowers/specs/2026-04-20-cfgm-v2-invention-claims.md`
- 워커 보고: `.omc/handoffs/worker-reports/T1~T6`
