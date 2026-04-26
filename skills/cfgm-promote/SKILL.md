---
name: cfgm-promote
description: Bundle→Identity 승격 후보를 review로 일괄 디스플레이하고 사용자가 번호/ID별로 결정한 뒤 batch로 일괄 처리한다. ADR-011 워크플로우.
---

# /cfgm-promote

**호출**: "검토해줘" · "promote 봐줘" 같은 자연어 트리거를 우선한다. 슬래시 `/cfgm-promote`는 fallback.

## 표준 흐름 (ADR-011)

session-start nudge("promotion pending 후보 N건", N ≥ 5)를 본 직후 Claude 본체가 다음을 자연 흐름으로 수행한다.

1. **review 호출** — `bun run bin/cfgm-promote-review.ts` 실행. target별 그룹·위험 마커(⚠️ 동일 target ≥ 3건)·결정 안내 표가 출력됨.
2. **화면 구성** — review 출력을 사용자에게 보여주고, 각 후보의 의도(`proposedLabel`·`metrics`)를 1줄씩 평가 의견과 함께 정리한다. 예: "[1] tools/Bash 5회 — 일상 패턴이라 accept 권장 / [2] strategies/X — false positive 추정, reject 권장".
3. **사용자 결정 수렴** — "이 결정으로 진행할까요? 번호/ID로 응답 부탁드립니다(예: `accept 1,3,5 reject 2,4`)" 형식으로 사용자에게 묻는다.
4. **batch 호출** — 사용자 응답을 ID로 변환해 `bun run bin/cfgm-promote-batch.ts --accept ID,ID --reject ID,ID --reason "검토 완료"` 호출.
5. **결과 보고** — batch 출력의 처리/실패 건수를 사용자에게 1줄로 보고. 부분 실패 시 실패 ID와 원인 명시.

## 거부 규칙 (ADR-011 §2 R2 완화)

- **광범위 동의 거부**: "다 좋아", "all accept", "y", "전부" 같은 응답은 처리하지 않는다. "번호/ID 명시 부탁드립니다"로 재요청.
- **target별 분리 권장**: 동일 target에 ⚠️ 마커가 있으면 사용자에게 별도 확인을 받은 뒤 batch에 포함.
- **position 결정 금지**: 후보 의도 평가는 Claude가 수행하지만, 최종 yes/no는 사용자만 결정. Claude가 사용자 의향 추정으로 batch를 자동 호출하지 않는다.

## 동작 모드 (CLI 단건)

### review — 묶음 디스플레이

```bash
bun run bin/cfgm-promote-review.ts                   # pending 전체
bun run bin/cfgm-promote-review.ts --target tools    # target 필터
bun run bin/cfgm-promote-review.ts --limit 10        # 상위 N건
bun run bin/cfgm-promote-review.ts --json            # JSON 덤프
```

### batch — 일괄 처리

```bash
bun run bin/cfgm-promote-batch.ts --accept ID,ID --reject ID,ID [--reason "..."] [--by user] [--force]
```

- `--accept` 또는 `--reject` 중 최소 하나 필수.
- 첫 실패 시 stop, 처리/실패 ID 리포트.
- `--force --reason`은 이미 decided 후보의 번복.

### list — 단건 조회 (fallback)

```bash
bun run bin/cfgm-promote-list.ts [--status pending|accepted|rejected|superseded] [--json]
```

### accept / reject — 단건 결정 (fallback)

```bash
bun run bin/cfgm-promote-accept.ts <candidateId> [--reason "..."] [--by user] [--force]
bun run bin/cfgm-promote-reject.ts <candidateId> [--reason "..."] [--by user] [--force]
```

표준 흐름은 review → batch. 단건 CLI는 트러블슈팅·예외 처리용.

## 상태 모델

```
pending → accepted   (긍정 결정)
        → rejected   (부정 결정)
        → superseded (다른 후보로 대체)
```

`--force --reason` 없이는 decided 후보 재변경 불가.

## 관련

- ADR-009 (`docs/adr/009-identity-promotion-sidecar.md`) — sidecar 모델 (§3 amended by ADR-011)
- ADR-011 (`docs/adr/011-workflow-auto-orchestration.md`) — 본 흐름의 정책 근거
- `src/core/identity/PromotionLedger.ts`, `CandidateDetector.ts`
- session-start nudge: `src/hooks/session-start.ts:259`
- 운영 측정: `docs/phase3-entry-snapshot-2026-04-26.md`
