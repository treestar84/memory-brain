# Phase 3 후보 분석 (v2 — codex 토론 반영)

> 작성일: 2026-04-26 (v2)
> 상태: codex(gpt-5.5) 토론 결과 반영 → Phase 3 진입 순서 확정
> 선행: Phase 2 종결 (PR-4 `acf1899`, ADR-008 `1eb7925`)
> 후속: ADR-009 (Identity sidecar 모델), PR-6 (FlowBlock.metadata)

---

## 0. v1 → v2 변경점 (codex 토론 반영)

| 항목 | v1 | v2 | 이유 |
|---|---|---|---|
| 진입 순서 | A → B → C 직진 | **B0 ADR(=ADR-009) → A → B1 sidecar MVP → ADR-008 재점검 → C 평가** | T3는 "구현 완료"가 아니라 "승격 흐름 결정"으로 충족 가능. 저장 모델 결정 없이 A의 reserved key를 정할 수 없음 |
| A 타입 자유도 | `Record<string,string>` 단독 | **reserved key + 확장 슬롯** (`{author?, subject?, source?, confidence?, [k]: string}`) | 자유 Record는 너무 느슨. provenance 라벨링이라는 1차 소비자에 맞춰 reserved key 명시 |
| A 1차 소비자 | dedup 키 확장 후보 포함 | **provenance/extractor 라벨링 only**. dedup 키 격상은 별도 PR | dedup 키 격상은 운영 데이터 없이 같이 묶으면 위험 |
| B 저장 모델 | "Identity 블록" (FlowBlock인지 sidecar인지 불명확) | **sidecar `identity/promoted-candidates.jsonl` 확정** | `FlowBlockType` enum에 `Identity` 없음. FlowBlock으로 가면 union/validator/projector 다 흔들림 |
| B 자동 vs LLM | rule-based 자동 vs LLM 합성 양자택일 | **둘 다 자동 쓰기 금지**. rule-based 후보 탐지 + 명시 명령 승인 | session-end 자동 승격은 ADR-008이 거부한 "자동 진입" 위험과 동일 |
| B PAI 통합 | "10-file 직접 반영 vs sidecar" | **sidecar 우선**. PAI 9-file 직접 쓰기 금지 | 실제는 9개(`telos/persona/user/tools/voice/beliefs/models/strategies/ideas`) + `goals` 별도. digest는 첫 문단 320B만 잘라 주입(`session-start.ts:54,72,110`) — 직접 append가 정합성 향상 보장 안 됨 |
| `PromotionEngine` 활용 | 기존 확장 후보 | **기존 엔진 재사용 금지**. 신규 모듈 | 기존 `PromotionEngine`은 ontology yaml 승격용(`src/core/ontology/PromotionEngine.ts:15`). 의미·저장소·정책 다름 |
| C k-NN | Phase 3 후보 | **Phase 4 이월 확정** | 임베딩 모델·HNSW 의존성 폭증, ADR-008 트리거 직접 기여 없음, 운영 데이터 누적 후 평가 fixture부터 시작이 정합 |
| LOC/TTS 추정 | A 30/0.5일, B 200/2일, C 150/3일 | **A 60~100/0.5~1일, B 300~600/3~5일, C 400+/5~8일** | 테스트·docs·rollback·평가 fixture까지 포함하면 v1 추정은 낙관 |

---

## 1. 확정된 진입 순서

| 단계 | 산출물 | 상태 |
|---|---|---|
| **1. ADR-009** | Identity sidecar 모델 + 명시 승인 정책 ADR | 본 PR에서 작성 |
| **2. PR-6** | `FlowBlock.metadata` reserved key 도입 | 본 세션 진행 |
| **3. PR-7** | Bundle→Identity sidecar MVP (rule-based 후보 + 명시 승인 CLI) | 별도 세션 |
| **4. ADR-008 게이트 재점검** | T1/T2/T3 자가 점검, ADR-010 작성 여부 결정 | PR-7 종료 후 |
| **5. (Phase 4) C k-NN** | 평가 fixture 우선, 임베딩/인덱스는 그 후 | Phase 4 |

---

## 2. PR-6 — `FlowBlock.metadata` (reserved key)

### 2.1 결정 사항 (codex 권장 반영)

| # | 결정 | 근거 |
|---|---|---|
| M1 | `metadata?: { author?: string; subject?: string; source?: string; confidence?: string; [key: string]: string \| undefined }` reserved key + 확장 슬롯 | provenance 라벨링이라는 1차 소비자에 맞춤 |
| M2 | 값은 string 또는 undefined 단일 타입 | Phase 3에서는 numeric/boolean 금지로 직렬화 안전 |
| M3 | backfill 없음 — 기존 블록은 metadata 없는 상태 허용 | PR-4와 동일한 "건드리지 않음" 원칙 |
| M4 | 1차 소비자: provenance/extractor 라벨링만. dedup 키 격상은 별도 PR(Phase 4 이후) | 운영 데이터 없이 키 격상은 위험 |
| M5 | `isFlowBlock` guard에 metadata shape 검증 추가 (있으면 object이고 모든 값이 string) | T2 충족 주장 위해 schema 도입의 실질적 검증 필요 |

### 2.2 추정 비용

- LOC: 60~100 (types + guards + 테스트)
- TTS: 0.5~1일

---

## 3. PR-7 — Bundle→Identity sidecar MVP (별도 세션)

### 3.1 결정 사항 (ADR-009에서 상세)

| # | 결정 |
|---|---|
| P1 | sidecar 경로: `identity/promoted-candidates.jsonl` (append-only) |
| P2 | 후보 탐지: rule-based만. LLM 합성·자동 쓰기 금지 |
| P3 | 승인 트리거: 명시 명령(`/cfgm-promote` 또는 동등). session-end 자동 금지 |
| P4 | 상태 모델: `pending / accepted / rejected / superseded` |
| P5 | 신규 모듈: `src/core/identity/PromotionLedger.ts` (기존 `PromotionEngine` 확장 금지) |
| P6 | PAI 9-file 직접 쓰기 금지. accepted 후보는 별도 export 흐름으로 분리 |

---

## 4. ADR-008 트리거 충족 흐름 (예측)

| 단계 | T1 | T2 | T3 |
|---|---|---|---|
| ADR-009 채택 | — | — | ✅ "승격 흐름 결정"으로 부분 충족 (구현 전제 아닌 결정 자체로) |
| PR-6 머지 | — | ✅ metadata schema 도입 | ✅ |
| PR-7 머지 | △ (사용 사례 발견 도와줌) | ✅ | ✅ (구현 완료) |

→ PR-7 종료 시점에 T2·T3 동시 충족. T1(사용자 사용 사례)이 그때 확정되어 있으면 ADR-010 작성 가능.

---

## 5. 잔여 리스크

| 위험 | 완화 |
|---|---|
| `metadata` reserved key 4개가 부족하거나 너무 좁음 | 확장 슬롯(`[k]: string`)으로 보강. PR-7 진행 중 발견되면 reserved key 추가 |
| sidecar 후보 ledger가 운영상 무거워짐 | rule-based 탐지 임계값 보수적으로 시작. 후보 수가 폭증하면 PR-7 종료 후 임계값 재튜닝 |
| 명시 명령 승인이 사용자 부담 증가 | bulk accept/reject CLI 옵션. nudge는 후보 수 임계값 초과 시에만 |
| Phase 4 k-NN이 영원히 이월 | ADR-008 게이트 재점검 시 Phase 4 진입 조건도 함께 정식화 |
