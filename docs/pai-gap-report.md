# PAI v4.0.3 ↔ memory-brain 갭 분석 리포트 (Phase 0 · v2.1)

> 작성일: 2026-04-24 (v2.1 개정)
> 기준 커밋: `0f93e91` (memory-brain/main)
> PAI 기준: `~/dev/Personal_AI_Infrastructure/Releases/v4.0.3` (실제 경로에 README + 이미지만 존재, 소스 트리 부재)
> v1 → v2 개정 사유: `/codex-plan-check` 1차 교차 검증 결과 v1이 baseline을 3군데 잘못 전제함.
> v2 → v2.1 개정 사유: `/codex-plan-check` 2차 교차 검증이 블로커 3건 지적 — (a) `bin/cfgm-apply-delta.ts`에 `questionQueue.rebuild()` 호출 부재, (b) PR-2→PR-3 선행 차단 주장이 코드와 불일치, (c) "PAI-import 6→3" 숫자 근거 부족 + Phase 1/2 경계 모호 + `partial` 답변 엣지 케이스 누락.

---

## 0. Executive Summary (v2)

memory-brain baseline에는 **이미 존재**하는 자산이 많다:

- **Gap → Question 재호출 루프**: `src/hooks/user-prompt-submit.ts:69-113`의 `injectQuestion()` — pending → asked 전환 후 system-reminder 주입. v1이 "양쪽 모두 없음"이라 잘못 전제함.
- **중앙 settings 레지스트리**: `bin/install-brain.ts:67, 527`에 idempotent marker 기반 hook 등록. v1이 "신규 도입 필요"라 과대평가.
- **`askedAt` 필드**: `src/core/flow/types.ts:44`에 singular 필드로 이미 존재. v1의 `askedAt[]` 제안은 중복.
- **Question lifecycle**: `pending | asked | answered | stale` 네 상태 이미 정의됨 (`types.ts:43`).

반대로 **baseline에 없거나 약한 것**:

- 구조적 `Gap`은 **projection 산출물** — `FlowGraphProjector`/`GapAnalyzer`가 매번 재생성, `FlowGraphValidator`가 `rule:*` gap의 delta 저장을 금지. 따라서 Gap 블록 자체에 durable state를 넣는 v1 설계는 **구조 위반**. 올바른 경로는 `asked.jsonl`/`pending.jsonl` sidecar + `gapBlockId` 기준 overlay (이미 `QuestionQueue`가 이 방향).
- `contentHash` / normalization dedup 유틸 — baseline 해시는 raw ledger hash + cue-card `bodyHash`뿐. 진짜로 없음 → **신규 필요**.
- PAI 식 transcript 기반 추출기 — `CanonicalEvent.payload`에 transcript path/assistant prose 필드 없음 (`CanonicalEvent.ts`). PAI `RelationshipMemory`/`WorkCompletionLearning` 이식은 "hook 2개 추가"가 아니라 **데이터 소스 도입까지 포함한 큰 작업**.
- `AskUserQuestion` 직접 호출 — `src/adapters/claude-code/hook-runner.ts:12`는 stdout 텍스트만 반환. SessionStart에서 tool 호출 경로 없음 → 실제 경로는 UserPromptSubmit stdout reminder (baseline이 이미 그 방향).
- `resolvedAs` 필드 (answered 이외의 "모름/해당없음" 상태 관리).
- Bundle → Identity 블록 승격 규칙.

**Phase 1 재권장 방향:**
1. 기존 `QuestionQueue`/`asked.jsonl` 위에 **cooldown·day-cap 정책** 덧붙이기 (Gap 루프 재발명 금지).
2. **새 write path에만** contentHash/normalization dedup 도입 (기존 블록 불변).
3. PAI 추출기 이식은 **transcript 데이터 소스 도입 결정이 선행**. 결정 전에는 bundle-only 추출로 범위 축소.
4. `settings.json` 확장은 **기존 installer contract에 additive key만** 추가. 신규 registry 파일/신규 hook type 금지.

---

## 1. baseline 실태(실코드 기준) — v1 오류 정정표

| v1 주장 | 실제 baseline | 출처 | v2 판정 |
|---|---|---|---|
| "Gap→Question 재호출 루프가 양쪽에 없다" | **이미 존재.** `QuestionQueue.listPending/listAsked/appendAsked` + UserPromptSubmit 주입 | `user-prompt-submit.ts:69-113`, `core/gap/QuestionQueue.ts`, `core/gap/QuestionLifecycleResolver.ts` | **v1 오판** → "확장"으로 재분류 |
| "settings.json 스타일 중앙 레지스트리 신규 도입 필요" | **이미 installer가 소유.** idempotent marker 기반 6 hook 등록 | `install-brain.ts:67,527`, `tests/bin/install-brain.test.ts:48,113` | **v1 과대평가** → additive key만 확장 |
| "블록에 `askedAt[]` 신규 필드 추가" | **이미 singular 필드로 존재.** `askedAt?: string \| null` | `flow/types.ts:44` | **v1 중복** → 기존 필드 사용 |
| "`detectorRef` 필드" | 실제 필드명은 `detectorId` | `flow/types.ts:36` | **v1 명명 오류** |
| "Question lifecycle 없음" | `pending \| asked \| answered \| stale` 4상태 존재 | `flow/types.ts:43` | **v1 누락** |
| "FlowGraph 구조 dedup 검증만 필요" | `contentHash` 유틸 **실제로 없음**. raw ledger hash + cue-card bodyHash뿐 | `core/ledger/RawLedger.ts:18`, `flow/types.ts:55` | **v1 과대평가** → 진짜 신규 작업 |
| "SessionEnd 2-훅 이식은 hook 2개 추가" | **transcript path/assistant prose 소스가 CanonicalEvent에 없음.** 먼저 데이터 소스 결정 필요 | `events/CanonicalEvent.ts:17-26`, `hooks/session-end.ts:27` vs PAI `RelationshipMemory.hook.ts:36` | **v1 축소평가** → 선행 결정 필요 |
| "AskUserQuestion을 SessionStart에서 호출" | hook runner는 stdout만 반환. SessionStart 직접 호출 불가. 실제 경로는 UPS reminder | `adapters/claude-code/hook-runner.ts:12`, PAI `THEHOOKSYSTEM.md:263` | **v1 구조 착각** → system-reminder만 사용 |

---

## 2. 4개 포커스 영역 재평가

### 2-1. 시작 포인트 대화 루프

| 항목 | PAI v4.0.3 | memory-brain baseline | v2 판정 |
|---|---|---|---|
| 강제 주입 | `settings.json > loadAtStartup.files[]` | `session-start.ts` identity digest (320B/1600B 상한) | memory-brain 우세 (자동 요약) |
| Identity 자동 주입 | 수동 등록 | 9파일 자동 digest | memory-brain 우세 |
| 3-Mode 응답 헤더 | 강제 | 없음 | Phase 2+ 옵트인 (잔류) |
| 엔티티 태깅 | `@Principal/@DA` 관례 | metadata 자동 태깅 없음 | **Phase 1 이식 가치 잔류** |
| 시작 질문 주도 | Packs/Telos 수동 인터뷰 | CFGM bootstrap 스킬 + UPS question injection | memory-brain 우세 |

**v2 결론:** v1과 동일 — 시작 포인트는 memory-brain이 이미 나음. PAI에서 이식할 건 **엔티티 태깅 관례만**. `loadAtStartup` 패턴은 이미 있음.

### 2-2. Identity / TELOS 자동 생성

| 항목 | PAI | memory-brain | v2 판정 |
|---|---|---|---|
| 파일 스키마 수 | 18+ | 9 | 현상 유지 (과잉 확장 금지) |
| 부트스트랩 인터뷰 | Daniel 수동 인터뷰 | `cfgm-identity-bootstrap` 스킬 | memory-brain 우세 |
| 자동 갱신 경로 | 수동 편집 | Bundle→Identity 승격 **아직 없음** | **Phase 2+ 잔류** |
| 신뢰도 필터 | OPINIONS.md ≥0.85 | FlowBlock `confidence` 있으나 주입 필터 없음 | **Phase 1 이식 가치 잔류** |

### 2-3. 인과관계 KG 자동 합성

| 항목 | PAI | memory-brain | v2 판정 |
|---|---|---|---|
| 노드 타입 | 없음 (W/B/O 태그) | 13 block types | memory-brain 압도 |
| 엣지 타입 | 없음 | 5 relations | memory-brain 압도 |
| 자동 추출 | 정규식 5종 + transcript | bundle 기반 | **데이터 소스 격차 있음** |
| dedup | 없음 (append-only) | `contentHash` 유틸 **없음** | **Phase 1 신규** |
| 저장 매체 | 마크다운 파일 | Storage 추상화(ADR-001) | memory-brain 우세 |

### 2-4. Gap 감지 / 재질문 루프

| 항목 | PAI | memory-brain baseline | v2 판정 |
|---|---|---|---|
| Gap 블록 | 없음 | `Gap` type + `detectorId`, projection 산출물 | memory-brain 존재 |
| 초기 저장 질문 | GAPS.md 수동 검토 | CFGM bootstrap | 양쪽 존재 |
| **재호출 Gap 인식** | 없음 | **`injectQuestion()` 이미 존재** (`user-prompt-submit.ts:85-108`) | **v1 오판 정정 — 이미 있음** |
| AskUserQuestion 연결 | tool | UPS stdout reminder (110행) | baseline 방식 유지 |
| 재질문 중복 방지 | N/A | `askedQuestionIds` / `askedGapIds` Set 체크 | **존재**. cooldown/day-cap만 추가 |
| "모름" 상태 (`resolvedAs`) | N/A | 없음 | **Phase 1 신규 필드 가치 있음** |

**v2 결론:** Gap 루프는 이미 구현됨. Phase 1은 **정책 레이어만 추가** (cooldown, day-cap, `resolvedAs` stale 전환 강화).

---

## 3. 엣지 케이스 (v1 4개 + v2 신규 5개)

### v1 기존 4개
- (1) 중복 저장: `contentHash` 유틸 실제 없음 → Phase 1 신규. 기존 블록 불변, **새 write path에만** 적용.
- (2) 호출: `confidence × recency × relevance` 스코어링 공식 미확정. 주입은 UPS stdout reminder 일원화.
- (3) 저장 방식: JSON 블록 + PAI-호환 마크다운 export는 **Phase 2 이후**로 이월 (오버엔지니어링 방지).
- (4) 저장 시점: Stop 버퍼 + SessionEnd 합성 2단계는 보류. **bundle 기반 추출 우선**, transcript 도입 결정 이후 재검토.

### v2 신규 5개 (Codex 지적 반영)
- (5) **구조적 Gap의 비지속성**: `FlowGraphProjector`가 매번 gap을 재생성, `FlowGraphValidator`가 `rule:*` gap의 delta 저장 금지. 따라서 **Gap 블록에 durable state 추가 불가** → sidecar 오버레이만 허용.
- (6) **Projection 시 gap recency 리셋**: 새 bundle 합성 시 기존 Gap이 새 `blockId`로 재생성될 가능성. `askedGapIds` 매칭이 깨질 수 있음 → 정렬키로 `detectorId` + `subject.blockId` 사용 고려.
- (7) **UserPromptSubmit vs SessionStart 이중 질문**: SessionStart에도 gap scan 넣으면 이중화. **UPS 경로 단일화 유지**.
- (8) **Transcript 소스 부재**: PAI 추출기 이식 전에 `CanonicalEvent`에 transcript path 필드 추가할지 결정 필요. 추가 시 hook-runner 계약 변경 → **Phase 1 착수 전 선행 결정**.
- (9) **`rewriteJsonl`/snapshot last-writer-wins 경합**: subagent 병렬 실행 시 `QuestionQueue` 기반 jsonl이 동시 쓰기 충돌 가능. **파일 락/append-only 전용 보장 필요**.

### v2.1 추가 1개 (Codex 2차 검토 지적 반영)
- (10) **Question partial answer 상태 부재**: 현재 lifecycle은 `pending|asked|answered|stale` 4상태뿐(`src/core/gap/types.ts:31`, `src/core/flow/types.ts:43`). 사용자가 질문에 "일부만" 답한 경우 분류할 상태 없음 → PR-3 `resolution` 필드에 `"partial"` 값을 남길지 Phase 2로 이월할지 결정 필요. 현재 합의: **Phase 2 이월** (PR-3는 `answered|unknown|deferred` 3값만).

---

## 4. Phase 1 범위 재정의 (v2.1 재표기)

v2.1 수정: Codex 2차 검토가 "PR-2→PR-3 선행 차단" 주장과 "Phase 1=4-PR" 프레이밍을 블로커로 지적. 실제로 PR-3은 transcript-independent하고 PR-4는 Phase 2 이월 가능성이 큼. 재표기:

- **Phase 1 본체 = PR-1 + PR-3** (구현 대상)
- **Phase 1 결정 = PR-2** (ADR-007로 완료, 후속 PR을 차단하지 않음)
- **Phase 2 이월 = PR-4** (dedup + metadata)

### PR-1: config additive (완료·미머지)
- **목표:** `~/.claude-brain/settings.json`에 `memoryBrain.questionPolicy.{cooldownMinutes, dailyCap}` additive key만 추가.
- **touch:** `src/core/flow/config.ts` (`QUESTION_POLICY` 블록), `src/core/settings/SettingsReader.ts` 신규, `tests/core/settings/SettingsReader.test.ts` 신규.
- **non-touch:** 기존 6 hook 등록, idempotent marker, installer 계약, `install-brain.ts` managed block.
- **상태:** 7개 신규 테스트 + 전체 446/446 통과. 기존 테스트 수정 0건.

### PR-2: data-source 결정 (완료)
- **결정:** bundle-only 유지. transcript path `CanonicalEvent.payload` 추가 보류.
- **산출:** `docs/adr/007-transcript-source-decision.md`.
- **영향:** PR-3·향후 이식 논의의 기준선. **후속 PR을 차단하지 않음** (PR-3는 transcript 의존 없음).

### PR-3: question-policy 확장 (진행 중)
- **목표:** 기존 `QuestionQueue` 위에 cooldown · day-cap · `resolvedAs` 상태 + stale 전환 정책.
- **touch:** `bin/cfgm-apply-delta.ts` (단일 writer로 `questionQueue.rebuild(graph)` 삽입), `src/core/gap/QuestionQueue.ts`, `QuestionLifecycleResolver.ts`, `src/core/gap/types.ts`(`AskedRecord.resolution` 필드 추가), `src/core/clock/Clock.ts`(`isoDate()` 추가), `src/hooks/user-prompt-submit.ts`(정책 가드), `src/hooks/bootstrap.ts`(SettingsReader 주입), `bin/cfgm-process.ts`("모름" UX).
- **non-touch:** `Gap` 블록 스키마(`flow/types.ts`) 불변. projection 로직 불변.
- **`resolvedAs` 저장 경로:** Codex 권고 A안 확정 — `asked.jsonl`의 `AskedRecord`에 `resolution?: "answered"|"unknown"|"deferred"` 필드 추가(append-only 보존). `block-supersede.reason="resolved:unknown"`은 보조 근거로만 사용.
- **첫 커밋:** `bin/cfgm-apply-delta.ts`의 투사 루프에 `questionQueue.rebuild(graph)` 삽입 + 회귀 테스트. 문서 전제와 런타임 정합화.
- **테스트:** cooldown 경계, day-cap 리셋(UTC 경계), `resolution="unknown"` 재노출 금지, `rebuild()` 단일 호출부 회귀.
- **OSS 고려:** cooldown/day-cap은 단순 Date 비교 — native만 사용. jsonl 파일락은 현 시점 단일 writer 규약으로 충분, 필요 시 `proper-lockfile` 검토.

### PR-4: dedup + 엔티티 태깅 (Phase 2 이월)
- **이월 사유:** Phase 1 본체 성공률(74%) 유지를 위해 분리. PR-1/PR-3 완료 후 별도 Phase 2 설계 세션에서 재착수.
- **원안(참고):** 새 write path에 `contentHash`(NFKC · 소문자 · 공백 squeeze · 엔티티 치환) + metadata `author`/`subject` 자동 태깅. 기존 블록 재해싱 금지.

### OUT-of-scope (Phase 2+)
- PAI 추출기 이식 (transcript 결정 후)
- LLM 기반 Bundle 합성 고도화
- k-NN 유사도 dedup (`hnswlib-node`)
- Bundle → Identity 승격
- 3-Mode 응답 헤더
- PAI-호환 마크다운 export 뷰
- 주기 재합성 cron

---

## 5. OSS 후보 (v2 보강)

| 용도 | v1 후보 | v2 추가 | 비고 |
|---|---|---|---|
| 임베딩 | `@xenova/transformers` | `fastembed` + `onnxruntime-node` | Bun 호환 고려. 1차는 `@xenova` 안전 |
| ANN dedup | — | `hnswlib-node` | Phase 2 |
| 그래프 알고리즘 | — | `graphology`, `@dagrejs/graphlib` | 저장은 과잉, 알고리즘 레이어만 |
| 그래프 저장 | `bun:sqlite` | 유지 | Neo4j 과잉 |
| Transcript 파싱 | PAI TranscriptParser 참조 | `stream-json`(JSONL 스트리밍), `jsonrepair`(깨진 파일) | 큰 transcript 대비 |
| 스케줄러 | `CronCreate` | `node-cron`, `cron-parser`, `Bree` | Phase 2+ |

---

## 6. 리스크 재정렬 (Codex 반영)

**수용 가능:**
- 구조적 Gap은 sidecar 오버레이 전용 (Gap 블록에 durable state 금지)
- Phase 1을 4-PR로 분할
- transcript 도입 결정을 PR-2에서 선행
- UPS 경로 단일화 유지, SessionStart 별도 gap scan 도입 금지

**수용 불가:**
- Gap 블록에 `openQuestions`/`resolvedAs` 직접 필드 추가 (projection 재생성 시 소실)
- 별도 registry 파일 신설 (installer idempotency 깨짐)
- 기존 블록에 재해싱/후처리 적용 (last-writer-wins 경합)
- transcript 데이터 소스 확보 없이 PAI 추출기 이식

---

## 7. v1에서 제거/재분류된 항목

**제거:**
- ❌ "Gap→Question 재호출 루프 신규 설계" → baseline에 이미 있음. 정책 보강으로 재범주.
- ❌ "settings.json 스타일 중앙 레지스트리 신규" → installer가 이미 소유. additive key만.
- ❌ "블록 `askedAt[]` 필드 추가" → 이미 singular 필드로 존재.

**memory-brain 측 실 신규 4항목:**
1. `contentHash` + normalization dedup 유틸 (진짜 신규, PR-4 → Phase 2 이월)
2. transcript-backed extractors (ADR-007로 bundle-only 결정, Phase 2+ 이월)
3. Bundle → Identity 블록 승격 (Phase 2+)
4. `resolvedAs` 상태 + stale 전환 정책 (PR-3 진행)

**PAI에서 이식 가치 있는 3항목 (패턴 차용):**
- OPINIONS ≥0.85 신뢰도 필터 패턴 (Phase 2+)
- 엔티티 자동 태깅 관례 — metadata 필드 (Phase 2+, PR-4 합류)
- 3-Mode 응답 헤더 — 옵트인 (Phase 2+)

> PAI v4.0.3 원본 소스 트리가 현재 머신에 없음(`~/dev/Personal_AI_Infrastructure/Releases/v4.0.3`에 README + 이미지만). 따라서 이식 3항목은 **패턴 차용**에 한정하며, 구체 구현은 원본 재획득 후 재검증.

---

## 8. 다음 단계

1. 본 v2 리포트에 대한 사용자 승인 요청.
2. 승인 시 PR-2(transcript 결정 ADR) 먼저 초안 작성 — PR-3/4의 범위가 여기에 의존.
3. PR-1(config additive)은 ADR 결과와 무관하게 병렬 진행 가능.
4. 각 PR 착수 전 TaskCreate로 세분화 + 개별 코드 리뷰 사이클.

---

## 9. 참고 심볼 인덱스 (v2)

- `src/core/flow/types.ts:20-53` — FlowBlock 스키마, Gap/Question 필드
- `src/hooks/user-prompt-submit.ts:69-113` — 기존 question inject 루프
- `src/core/gap/QuestionQueue.ts:22` — pending/asked 관리
- `src/core/gap/QuestionLifecycleResolver.ts:15` — lifecycle 전환
- `src/core/flow/FlowGraphProjector.ts:21` — gap 재투사
- `src/core/gap/GapAnalyzer.ts:14` — gap 생성 (매번)
- `src/core/flow/FlowGraphValidator.ts:19` — `rule:*` gap delta 저장 금지
- `bin/install-brain.ts:67,527` — settings.json 관리
- `tests/bin/install-brain.test.ts:48,113` — idempotent marker 검증
- `src/adapters/claude-code/hook-runner.ts:12` — stdout-only 계약
- `src/core/events/CanonicalEvent.ts:17-26` — payload에 transcript 부재
- `src/hooks/session-end.ts:27` — 현 SessionEnd (transcript 미사용)
- `docs/handoff.md:22` — Epic 3 golden path 기존 경로

