# ADR-012: claim/evidence sidecar 도입 — FlowBlock→claim 단방향 변환

**날짜**: 2026-04-26
**상태**: 채택됨
**관련 에픽**: Phase A1 (vision evolution, plan v2)
**연관**: ADR-008 (게이트 정신), ADR-009 (sidecar 패턴), ADR-011 (자가 호출 정신), `.omc/plans/vision-evolution-claim-grounded-os.md` v2

---

## 결정

비전 §3.2("기억은 claim 단위로") 도입을 **sidecar 모델 + 단방향 변환**으로 진입한다.

1. **저장**: 신규 sidecar `claims/ledger.jsonl` (append-only, last-wins). FlowBlock 보존, `FlowBlockType` enum에 `Claim` 추가하지 **않음**(ADR-009 X1 거부 사유 답습).
2. **탐지**: FlowBlock(`Outcome`/`Rule` 중 `confidence ≥ 0.7`) → claim 후보 **단방향 변환** (`FlowBlockToClaimCandidate`). 역방향 변환 금지.
3. **승격**: 자동 승격 금지(ADR-009 §3 amended 답습). PromotionLedger 패턴을 그대로 답습 — `pending → accepted/rejected/superseded` 상태 모델 + `--force --reason` 가역.
4. **신규 모듈**: `src/core/claim/{types,ClaimStore,ClaimProjector,FlowBlockToClaimCandidate}.ts` + `bin/cfgm-claim-list.ts`.
5. **훅 통합**: `src/hooks/session-end.ts`에서 sealed bundle을 PromotionLedger와 **동시 소비** (둘 다 detect 후 각자 sidecar에 append). append-only 원칙 보존.
6. **accept/reject CLI 미포함**: 본 PR 범위에서는 list만. 1주 운영 데이터 보고 schema 보정 후 PR-A1.1에서 추가.

## 진입 게이트 처리

`plan v2 §7.1` 진입 게이트:
> "(PR-7 운영 ≥ 5건 누적 AND accept 비율 ≥ 30%) AND (사용자 명시 사용 사례 1건 — phase3-snapshot §4 카탈로그 S1/S2/S3 형식)"

**현 시점 (2026-04-26) 충족 상태:**

- **AND 항 1** (PR-7 운영 ≥ 5건 + accept ≥ 30%): **미충족** — PR-7(`611b8c9`) 머지 직후, 운영 0건.
- **AND 항 2** (사용 사례 1건 S1/S2/S3): **충족** — 사용자가 `memory_system_improvement_prompt.md` 비전 발화(2026-04-26) + ralplan v2 합의 후 "합의된 것에 대해 구현 진행" 명시 결정. phase3-snapshot §4 카탈로그 **S3(작업 학습 패턴 — claim/evidence로 자기 학습 기록)** 형식에 가장 가까움.

**AND 항 1 우회 결정**:

- 사용자 명시 결정으로 게이트 우회. ADR-018(예정) §3 "객관 항목 절대 우선" 정신을 본 ADR 한정으로 임시 ARM-DOWN.
- **후속 검증 의무**: PR-A1.0 머지 후 1주 내 (1) PR-7 운영 데이터 + (2) claim 후보 발화 측정 시점에 본 ADR §우회 결정의 정합성을 재평가. 두 측정이 모두 0건 지속 시 PR-A1.0 변환기 자가 호출을 "dormant" 처리하는 amend 의무.

## 거부 대안

### X1. `FlowBlockType` enum에 `Claim` 추가
- 거부 사유: ADR-009 X1과 동일 — `FlowBlockType` 변경, validator/projector/CLI/tests 다중 변경. 의미적으로도 FlowBlock(인과 그래프 노드)과 claim(진술 원장)은 다른 추상.

### X2. 빅뱅 재구조화 (Option B in plan v2 §1.3)
- 거부 사유: 사용자 "폐기하지 말 것" 발화 직접 충돌 + ADR superseded 6건 비용 + 단일 PR 폭발 위험.

### X3. LLM 기반 자동 합성
- 거부 사유: ADR-009 X3 답습 — Phase 첫 진입에서 LLM 합성은 비용·재현성·신뢰 모든 축에서 검증 부담↑. 후속 ADR(예: claim PAI export 흐름)로 분리.

### X4. markdown source-of-truth만 (jsonl ledger 없이)
- 거부 사유: audit trail 부재. PromotionLedger 패턴이 jsonl + projection으로 검증된 모델.

### X5. accept/reject CLI 본 PR 포함
- 거부 사유: schema 미검증 상태에서 결정 인터페이스 추가는 1주 운영 후 retrofit 비용↑. PR-A1.1로 분리.

## 결과

### 영향 받는 파일

| 파일 | 변경 |
|---|---|
| `src/core/claim/types.ts` (신규) | `Claim`/`Evidence`/`Candidate` 타입 |
| `src/core/claim/ClaimStore.ts` (신규) | `claims/ledger.jsonl` append + last-wins list |
| `src/core/claim/ClaimProjector.ts` (신규) | `claims/active|superseded/{id}.md` 마크다운 렌더 |
| `src/core/claim/FlowBlockToClaimCandidate.ts` (신규) | Outcome/Rule confirmed → 후보 |
| `bin/cfgm-claim-list.ts` (신규) | pending/accepted/... 출력 |
| `src/hooks/session-end.ts` (수정) | sealed bundle을 PromotionLedger와 동시 소비 |
| `src/hooks/bootstrap.ts` (수정) | `claimStore` deps 표면 확장 |

### Architect v2 권장 흡수 / forward

- 권장 1 (ADR-013 §부속 "9-file 내부 inferred 표현"): **ADR-013 영역**, 본 ADR forward 메모로만.
- 권장 2 (ADR-013-pre PoC 정량 임계): **ADR-013-pre 영역**, 본 ADR forward 메모로만.
- 권장 3 (ADR-018 §3a 백스톱 카탈로그 nudge): **ADR-018 작성 시점**에 적용.
- 권장 4 (`selfInvocationCount` 측정): 본 PR 범위 밖 (PromotionLedger nudge 측정), 후속 분리.
- 권장 5 (§7.1 동치성 명시): **본 ADR §진입 게이트 처리**에서 이미 답습 (S3 카탈로그 인용).

### 후속 ADR 의존 흐름

- ADR-012 (본 문서) → ADR-018 (백스톱 메타-ADR) → ADR-013-pre (Honcho PoC) + ADR-013-pre2 (OSS 검토) → ADR-013 (Profile layer) → ADR-014 (governance) → ADR-015 (router contract) → ADR-016 (Honcho integration) → ADR-017 (derived index).

## 참고

- plan v2: `.omc/plans/vision-evolution-claim-grounded-os.md` (524줄, §5 ADR-012 초안)
- ADR-008 (`docs/adr/008-transcript-reentry-gates.md`)
- ADR-009 (`docs/adr/009-identity-promotion-sidecar.md`) — sidecar 패턴 답습 원본
- ADR-011 (`docs/adr/011-workflow-auto-orchestration.md`) — 자가 호출 ≥ 3 정신 답습
- `src/core/identity/PromotionLedger.ts` — 본 ADR이 답습할 패턴
- `src/core/flow/types.ts` — `FlowBlockType` 불변 보존 대상
- `docs/phase3-entry-snapshot-2026-04-26.md` §4 — S3 사용 사례 카탈로그
- ralplan consensus: Planner v1 → Architect v1 ITERATE → Critic v1 ITERATE → Planner v2 → Architect v2 ITERATE (8건 PASS + minor 권장 5건). 본 ADR이 plan v2 합의 후 첫 진입 commit.
