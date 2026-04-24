# Phase 2 범위 · 재설계 착수 노트

> 작성일: 2026-04-24
> 상태: 준비 단계 — 상세 설계는 Phase 2 착수 시점에 `/codex-plan-check` 교차검증 필수
> 선행: Phase 1 (PR-1 + PR-3) 완료 · commits `4aa7b55`, `9cc21c5`
> 연관: `docs/pai-gap-report.md` §4·§7, `docs/phase1-plan.md`, ADR-007

---

## 0. 스코프

**IN (Phase 2 착수 범위):**
- **PR-4 (재설계)**: `contentHash` 기반 dedup + metadata `author`/`subject` 자동 태깅
- **PR-5 (신규)**: transcript 데이터 소스 도입 결정 재개 (ADR-007을 rollback 또는 보강)

**OUT (Phase 2에 올리지 않음):**
- Bundle → Identity 블록 승격 — Phase 3
- LLM 기반 Bundle 합성 고도화 — Phase 3
- k-NN 유사도 dedup (`hnswlib-node`) — Phase 3
- 3-Mode 응답 헤더, PAI-호환 export 뷰 — 옵트인, 우선순위 낮음

---

## 1. PR-4 (재설계) — dedup + metadata 태깅

### 1.1 v1 원안 (gap report §4) 요약

- 새 write path에만 `contentHash`(NFKC · 소문자 · 공백 squeeze · 엔티티 치환)
- metadata `author`/`subject` 자동 태깅
- 기존 블록 재해싱 금지

### 1.2 재설계가 필요한 이유

Phase 1 완료 후 코드베이스가 변화했으므로 v1 원안을 그대로 적용할 수 없다. 재검증 대상:

1. **FlowBlock 스키마에 필드를 추가할지 vs 별도 index 파일**
   - 현 `FlowBlock`은 `status: "confirmed"|"superseded"`로 제한 — `contentHash`를 append 시에만 계산하고 `FlowGraphValidator`에 통과시켜야 함
   - 대안: `ledger/dedup-index.jsonl` sidecar (append-only) + `block-add` 시점에 lookup
2. **`author`/`subject` 추출 소스**
   - ADR-007 이후 `CanonicalEvent.payload`는 bundle-only — session context로부터 author 추출 경로가 얇음
   - PAI 원본 tree 부재로 이식이 아닌 신규 설계
3. **중복 판정 범위**
   - problem 단위 vs 글로벌. 글로벌이면 problem 이동 시 dedup 깨질 수 있음
4. **기존 블록 불변 원칙 유지 방법**
   - 새 write path(=`cfgm-apply-delta` projector)가 `contentHash`를 계산하고, 동일 해시가 이미 존재하면 delta 자체를 skip (dedup log만 남김)

### 1.3 결정 필요 항목 (Phase 2 설계 세션 인풋)

| # | 결정 필요 | 기본 제안 | 대안 |
|---|---|---|---|
| D1 | `contentHash` 저장 위치 | `dedup-index.jsonl` sidecar | `FlowBlock.contentHash` 필드 (schema 변경) |
| D2 | normalization 단계 | NFKC · lowercase · whitespace squeeze · 한국어 조사 제거 | 엔티티 치환까지 포함 (난이도↑) |
| D3 | 판정 범위 | problem 단위 | 글로벌 |
| D4 | dedup hit 시 동작 | delta skip + `security/dedup-log.jsonl` 기록 | `supersede` 생성 (기존 블록 갱신) |
| D5 | metadata 필드 추가 지점 | `FlowBlock.metadata?: Record<string, string>` (optional) | 별도 metadata sidecar |
| D6 | author 추출 소스 | `CanonicalEvent.sessionId` → session-owner lookup | 사용자 수동 입력 (`/cfgm-process tag`) |

### 1.4 OSS 후보 조사 (Phase 2 착수 시점에 재검증)

| 용도 | 후보 | 주의 |
|---|---|---|
| 문자열 정규화 | `unorm` (NFKC), 내장 `String.prototype.normalize` | Bun 네이티브 `normalize("NFKC")` 우선 |
| 해시 | `node:crypto` SHA-256 | 추가 의존성 불필요 |
| 엔티티 NER | `compromise` · `nlp.js` | 한국어 정확도 낮음, 후순위 |
| 임베딩 기반 유사도 | `@xenova/transformers`(다국어 E5) | Phase 3 k-NN과 함께 |

**결정:** dedup 자체는 OSS 불필요. 엔티티 태깅만 OSS 후보 검토.

### 1.5 테스트 전략 (가안)

- `tests/core/dedup/contentHash.test.ts`: 정규화 단계별 기대값, 유니코드 경계
- `tests/bin/cfgm-apply-delta.dedup.test.ts`: dedup hit 시 delta skip, dedup-log 기록
- `tests/e2e/epic?-dedup-golden.test.ts`: 동일 delta 2회 → graph 불변

---

## 2. PR-5 — transcript 데이터 소스 재검토 (옵션)

ADR-007은 "bundle-only로 Phase 1 한정 결정"이라고 명시. Phase 2에서는:

### 2.1 재개 조건

- PR-4 완료로 dedup·metadata 기반이 확보된 후
- 사용자로부터 transcript 파싱의 **구체 사용 사례** (e.g., 자동 relationship 추출, work-completion 학습) 확정 시

### 2.2 선행 질문

- transcript 파일 경로 규약 확정 (현재 `~/.claude/projects/<project>/<sessionId>.jsonl` 관찰됨)
- 파싱 예산 (바이트 제한, 스트림 처리 필수 여부)
- PII redaction 기준 재검토 (`src/core/security/Redactor.ts` 현 구현이 transcript 대용량에도 동작하는지)

### 2.3 ADR-007 후속 처리

- PR-5 착수 결정 시 **ADR-008 (transcript 도입)**을 신규 작성 — ADR-007을 "superseded"로 표시.
- ADR-007 자체는 rewrite 금지 (ADR 불변 원칙).

---

## 3. 착수 전 체크리스트

Phase 2 본격 시작 전에 다음을 확인:

- [ ] Phase 1 정책 (`QUESTION_POLICY`) 운영 데이터 1주일 이상 누적 — cooldown/dailyCap 기본값이 적절한지 통계로 검증
- [ ] `asked.jsonl` 에 `resolution` 레코드가 실제로 기록되는지 (수동 E2E 1회)
- [ ] `docs/pai-gap-report.md` §7 "신규 4항목 · 이식 3항목" 리스트가 Phase 2 이월 항목과 일치하는지 재확인
- [ ] OSS 후보 재조사 (12개월 내 커밋, Bun 호환) — `@xenova/transformers`, `compromise` 등

---

## 4. 위험 요소

| 위험 | 완화 |
|---|---|
| Phase 1 dailyCap=3이 실사용에서 너무 빡빡 | settings.json 오버라이드로 사용자가 먼저 튜닝 → 관측 후 기본값 재설정 |
| dedup 도입이 기존 golden path 테스트 byte-identical 깨뜨림 | 새 write path에만 적용 + golden path는 기본 설정(`DEDUP_ENABLED=false`)에서 유지 |
| transcript 스트림 파싱이 메모리 폭발 | `stream-json` + `jsonrepair` OSS 사전 검증 (gap report §OSS 표에 이미 언급) |
| metadata schema 변경이 기존 bundle 불일치 | optional 필드로 유지, existing bundle은 `metadata: undefined` 상태 허용 |

---

## 5. 승인 요청 (Phase 2 착수 시)

1. D1~D6 결정 항목 중 4개 이상 확정
2. OSS 후보 2차 조사 결과 제출
3. 성공률 ≥70% · TTS ≤3일 추정치 수용

> **주의:** 본 문서는 Phase 2 **착수 판단 전** 재설계 인풋이다. 실제 PR 실행은 `/codex-plan-check`로 1회 이상 교차검증 후 진행.
