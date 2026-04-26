# 2026-04-26 — Phase 3 진입 시점 스냅샷

> 본 문서는 ADR가 아니다. ADR-008 본문은 불변. 본 문서는 그 시점의 게이트 상태와 P3 운영 측정 표준을 기록하는 **journal snapshot**이다.
> 작성: 2026-04-26 (PR-7 `611b8c9` push 직후)
> 상태: 활성 (P3 운영 누적 종료 시 후속 노트로 superseded)

---

## 1. ADR-008 트리거 게이트 상태 (2026-04-26)

| 트리거 | 정의 (ADR-008 §재진입 트리거) | 충족 여부 | 근거 |
|---|---|---|---|
| **T1** | 사용자 사용 사례 ≥ 1건 (시나리오 + 소비자 + 측정 가능 outcome) | ❌ 미충족 | 사용자가 transcript 필요 사용 사례를 확정 발화한 적 없음. ADR-008 §49 형식 미충족. |
| **T2** | `FlowBlock.metadata` 또는 동등 메커니즘 도입 | ✅ 충족 | PR-6 commit `4716da1` (FlowBlock.metadata reserved key). `src/core/flow/types.ts`, `src/core/flow/guards.ts:isFlowBlockMetadata`. |
| **T3** | Bundle → Identity 승격 흐름 결정+구현 | ✅ 충족 | ADR-009 (`0e2ecce`) + PR-7 (`611b8c9`). `identity/promoted-candidates.jsonl` sidecar + `PromotionLedger` + 3 CLI. |

**현 시점 결론**: T2·T3 충족, T1 미충족 → ADR-008의 "2개 이상" 게이트는 **통과**. 그러나 T1이 비어 있으면 transcript 도입의 목적지가 공중에 뜬다(ADR-008 §대안 B 거부 사유). 따라서 ADR-010 작성 진입은 **T1 자연 도출 시점까지 대기**.

---

## 2. P3 운영 측정 표준 (필수 기록 항목)

P3 단계는 1주 운영 후 PR-7 임계값 튜닝을 결정한다. 결정의 객관성을 위해 다음 항목을 측정한다.

### 2.1 측정 항목

| 지표 | 출처 | 측정 단위 |
|---|---|---|
| 후보 발화 총 건수 | `identity/promoted-candidates.jsonl` 라인 수 | 주간 누적 |
| target 분포 | 각 라인 `proposedTarget` 카운트 | 9개 PAI 파일별 비율 |
| 상태 분포 | `last-wins` 후 `pending`/`accepted`/`rejected`/`superseded` 카운트 | 절대 수 + 비율 |
| detector 발화 비율 | `detectedBy` 카운트 (현재 `high-tool-call-pattern` 1종) | 룰별 발화 수 |
| accept 비율 | accepted ÷ (accepted + rejected) | % (decided 기준) |
| 결정 지연 | `createdAt` → `decidedAt` 평균/중앙 | 시간 |

### 2.2 판정식 (1주 운영 결과 → 다음 액션)

| 케이스 | 조건 | 액션 |
|---|---|---|
| **과다** | 주 ≥ 20건 AND accept 비율 < 10% | `HIGH_TOOL_CALL_THRESHOLD` 상향 (5 → 7~10) + detector 룰 추가 조건 (`touchedFiles ≥ N` 등) |
| **부재** | 주 0건 | 임계값 하향 (5 → 3) 또는 룰 확장 (`touchedFiles`, `promptCount` 기반 detector 추가) |
| **적정** | 주 1~5건 AND accept ≥ 30% | 임계값 유지 — "보수적 시작" 가설이 데이터로 입증된 것으로 판정 |
| **데이터 부족** | 주 0건 + decided 0건 | "0건 자체가 데이터" — 현재 사용 패턴이 룰의 발화 영역 밖이라는 신호. 룰 재설계 검토. |

### 2.3 분기 트리거 (P3 → P4)

- **데이터 기반 우선**: `pending + decided ≥ 10`이 7일 이내 도달하면 그 시점에 즉시 판정.
- **시간 기반 백스톱**: 10건 미달이라도 7일 경과 시 "데이터 부족" 케이스로 판정 마감.
- **분기**: 판정 직후 P4-A(ADR-010 진입) vs P4-B(k-NN 평가 fixture plan-check) 결정.

---

## 3. P4 분기 조건

| 분기 | 진입 트리거 | 거부 트리거 |
|---|---|---|
| **P4-A** ADR-010 (transcript 도입) | T1 자연 도출 (운영 중 사용자가 "transcript 없이는 안 풀리는 사용 사례"를 발화) AND T2·T3 충족 유지 | T1 미발화 — 인터뷰로 유도 금지. ADR-008 게이트 약화 우려. |
| **P4-B** Phase 4 (k-NN 평가 fixture plan-check) | T1 미충족 + PR-7 안정(주 1~5건 적정 케이스 유지) | PR-7 false positive 과다 또는 detector 룰 재설계 진행 중일 때 |

---

## 4. T1 시나리오 카탈로그 (참고용 후보, 합의 미확정)

본 카탈로그는 **사용자에게 인터뷰로 제시할 옵션이 아니다**. 운영 중 사용자 발화가 다음 중 하나에 자연스럽게 매칭되면 T1 충족으로 판정한다.

### 후보 S1. 주간 retrospective
- **시나리오**: 세션 종료 시 "이번 주 작업 요약 / 풀린 가설·풀리지 않은 가설"을 transcript에서 추출해 `journal/weekly-YYYY-WW.md`에 저장.
- **소비자**: 다음 세션 session-start digest의 "최근 변경" 섹션 + 사람 검토.
- **측정 가능 outcome**: 1주 ≥ 1건 retrospective 생성, 사용자 정정률 < 30%.

### 후보 S2. 관계/사람 노트
- **시나리오**: 대화 중 등장한 사람·도구·외부 시스템 언급을 transcript에서 추출해 `identity/relationship-notes.md`에 누적.
- **소비자**: PAI digest 또는 별도 export 흐름.
- **측정 가능 outcome**: 1주 ≥ 5건 노트, accept 비율 ≥ 50%.

### 후보 S3. 작업 학습 패턴
- **시나리오**: "X를 할 때 Y로 했더니 잘 됐다/안 됐다" 형태의 자기 학습 기록을 transcript prose에서 추출해 `identity/strategies.md` 후보로 PromotionLedger에 append.
- **소비자**: 기존 PR-7 PromotionLedger 흐름 재사용 (extractor만 추가).
- **측정 가능 outcome**: 1주 ≥ 3건 후보, accept 비율 ≥ 30%.

→ 위 3건 모두 사용자가 명시 발화하기 전에는 T1 미충족. 가장 가까운 형식은 S3(기존 PR-7 흐름 재사용).

---

## 5. 운영 규칙

- 본 snapshot은 ADR이 아니므로 commit/edit 자유. 단 ADR-008 본문은 손대지 않는다.
- P3 운영 누적 종료 시(7일 후 또는 데이터 10건 도달 시) 후속 snapshot(`docs/pr7-tuning-snapshot-YYYY-MM-DD.md`) 작성 후 본 snapshot은 superseded 표시.
- P3 집계 CLI(`bin/cfgm-promote-stats.ts`)는 운영 데이터 누적이 실제 시작된 뒤(첫 후보 발화 또는 3일 경과) 별도 PR로 추가. 본 snapshot 단계에는 묶지 않는다.

---

## 참고

- `docs/adr/008-transcript-reentry-gates.md` — T1~T3 정의
- `docs/adr/009-identity-promotion-sidecar.md` — sidecar 모델 + 명시 승인
- `src/core/identity/CandidateDetector.ts:6` (`HIGH_TOOL_CALL_THRESHOLD = 5`)
- `src/hooks/session-start.ts:18` (`PROMOTION_NUDGE_THRESHOLD = 5`)
- commit `4716da1` (PR-6 metadata), `611b8c9` (PR-7 sidecar)
