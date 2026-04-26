---
name: cfgm-promote
description: Bundle→Identity 승격 후보(`identity/promoted-candidates.jsonl`)를 조회·수락·거절한다. PR-7 sidecar 모델의 사용자 결정 인터페이스.
---

# /cfgm-promote

**역할**: PR-7(`ADR-009`)이 도입한 Identity 승격 후보를 사용자가 검토하고 결정한다. 자동 쓰기는 금지(ADR-009 §결정 §3) — 모든 상태 전이는 명시 명령으로만.

**저장 위치**: `identity/promoted-candidates.jsonl` (append-only, last-wins)

## 동작 모드

### 1) 후보 조회 — `list`

```bash
bun run bin/cfgm-promote-list.ts                     # pending 기본
bun run bin/cfgm-promote-list.ts --status accepted
bun run bin/cfgm-promote-list.ts --status rejected
bun run bin/cfgm-promote-list.ts --status superseded
bun run bin/cfgm-promote-list.ts --json              # JSON 전체 덤프
```

출력 컬럼: `candidateId  proposedTarget  proposedLabel  by=detectorId  createdAt`

`--status`는 `pending|accepted|rejected|superseded` 중 하나. 미지정 시 `pending`.

### 2) 후보 수락 — `accept`

```bash
bun run bin/cfgm-promote-accept.ts <candidateId> [--reason "..."] [--by user]
```

- `<candidateId>`: list 출력의 첫 컬럼 full ID. 정확 매치만 지원.
- `--reason`: 선택. 결정 사유 메모.
- `--by`: 선택. 결정자(기본 `"user"`).
- accepted 후보의 PAI 9-file export는 본 PR 범위 밖(별도 ADR-011 후보).

### 3) 후보 거절 — `reject`

```bash
bun run bin/cfgm-promote-reject.ts <candidateId> [--reason "..."] [--by user]
```

인자 형식은 accept과 동일.

### 4) 결정 번복 — `--force --reason`

이미 decided된 후보의 상태를 바꾸려면 `--force`와 `--reason`을 함께 줘야 한다.

```bash
bun run bin/cfgm-promote-accept.ts <candidateId> --force --reason "재평가 결과 유효"
```

`--force`만 있고 `--reason`이 없으면 거부된다.

## 사용 흐름

1. session-start nudge 메시지에서 "promotion pending 후보 N건"을 본다(N ≥ `PROMOTION_NUDGE_THRESHOLD = 5`).
2. `/cfgm-promote list`로 pending 후보 일괄 조회.
3. 각 후보를 `proposedTarget`(9개 PAI 파일 중 하나)와 `proposedLabel`로 검토.
4. 의도가 맞으면 `/cfgm-promote accept <id>`, 아니면 `/cfgm-promote reject <id>`.
5. 결정은 `identity/promoted-candidates.jsonl`에 새 라인으로 append. 기존 라인은 보존(audit trail).

## 상태 모델

```
pending → accepted   (긍정 결정)
        → rejected   (부정 결정)
        → superseded (다른 후보로 대체)
```

`accepted`/`rejected`/`superseded`는 `--force --reason` 없이는 다시 못 바꾼다.

## 관련

- ADR-009 (`docs/adr/009-identity-promotion-sidecar.md`)
- `src/core/identity/PromotionLedger.ts`, `CandidateDetector.ts`
- session-start nudge: `src/hooks/session-start.ts:259`
- 운영 측정 표준: `docs/phase3-entry-snapshot-2026-04-26.md`
