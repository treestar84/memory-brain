---
name: cfgm-claim
description: claim 후보(`claims/ledger.jsonl`)를 review 로 일괄 디스플레이하고 사용자가 번호/ID별로 결정한 뒤 batch 로 일괄 처리한다. ADR-012 + ADR-019 §3 (Graphiti) + PR-A1.1 워크플로우.
---

# /cfgm-claim

**호출**: "claim 검토해줘" · "사실 검토" 같은 자연어 트리거를 우선한다. 슬래시 `/cfgm-claim` 은 fallback.

## 표준 흐름 (ADR-011 정신 답습)

session-start nudge 또는 사용자 명시 요청 시 Claude 본체가 다음을 자연 흐름으로 수행한다.

1. **review 호출** — `bun run bin/cfgm-claim-review.ts` 실행. proposedType 별 그룹 + 위험 마커(⚠️ 동일 type ≥ 3건) + 결정 안내 표.
2. **화면 구성** — 각 후보의 의도(`proposedText` / `evidence` / `confidence`) 를 1줄씩 평가 의견과 함께 정리.
3. **사용자 결정 수렴** — "이 결정으로 진행할까요? 번호/ID 로 응답 부탁드립니다 (예: `accept 1,3,5 reject 2,4`)" 형식.
4. **batch 호출** — 사용자 응답을 ID 로 변환해 `bun run bin/cfgm-claim-batch.ts --accept ID,ID --reject ID,ID --reason "검토 완료"` 호출.
5. **결과 보고** — batch 출력의 처리/실패 건수를 사용자에게 1줄로 보고.

## 거부 규칙 (ADR-011 §2 정신 답습)

- **광범위 동의 거부**: "다 좋아", "all accept", "y", "전부" 같은 응답은 처리하지 않는다.
- **type 별 분리 권장**: 동일 type 에 ⚠️ 마커 있으면 사용자에게 별도 확인.
- **position 결정 금지**: 후보 의도 평가는 Claude 가 수행하지만, 최종 yes/no 는 사용자만 결정.

## 동작 모드

### review — 묶음 디스플레이

```bash
bun run bin/cfgm-claim-review.ts                   # pending 전체
bun run bin/cfgm-claim-review.ts --type outcome    # type 필터
bun run bin/cfgm-claim-review.ts --limit 10
bun run bin/cfgm-claim-review.ts --json
```

### batch — 일괄 처리

```bash
bun run bin/cfgm-claim-batch.ts --accept ID,ID --reject ID,ID [--reason "..."] [--by user] [--force]
```

`--force --reason` 은 이미 decided 후보의 번복.

### list — 단건 조회 (fallback)

```bash
bun run bin/cfgm-claim-list.ts [--status pending|accepted|rejected|superseded] [--json]
```

### accept / reject — 단건 결정 (fallback)

```bash
bun run bin/cfgm-claim-accept.ts <candidateId> [--reason "..."] [--by user] [--force]
bun run bin/cfgm-claim-reject.ts <candidateId> [--reason "..."] [--by user] [--force]
```

표준 흐름은 review → batch. 단건 CLI 는 트러블슈팅·예외 처리용.

## Graphiti supersede 모델 (ADR-019 §3)

accept 시점에 `validFrom` 자동 설정. supersede 또는 invalidate 는 별도 흐름:

```bash
# claim x 의 후속 claim y 로 supersede (ClaimStore.supersede 직접 호출 — 별도 CLI 미정)
# 후속 PR 에서 cfgm-claim-supersede CLI 추가 예정
```

## 상태 모델

```
pending → accepted   (긍정 결정 + validFrom 자동 설정)
        → rejected   (부정 결정)
        → superseded (다른 claim 으로 대체, ClaimStore.supersede)

accepted → invalidate (validity 변경 없이 invalidAt + reason 갱신, ClaimStore.invalidate)
```

`--force --reason` 없이는 decided claim 재변경 불가.

## 관련

- ADR-012 (`docs/adr/012-claim-evidence-sidecar.md`) — claim sidecar 도입
- ADR-019 §결정 §3 — Graphiti supersede 모델 답습
- ADR-011 — 자가 호출 정신 + 번호/ID 명시 결정 정신
- `src/core/claim/{ClaimStore,types,FlowBlockToClaimCandidate}.ts`
- `bin/cfgm-claim-{list,accept,reject,review,batch}.ts`
