---
name: cfgm-process
description: 미처리 ObservationBundle을 Flow Block으로 합성하여 문제의 인과 그래프를 갱신한다. 훅이 자동으로 수행하지 않는 의미 판단 전체가 이 스킬의 책임이다.
---

# /cfgm-process

**역할**: ObservationBundle을 읽고, 의미 있는 Flow Block으로 합성하여 `flow-delta.jsonl`에 커밋. 번들에는 관측의 전문이 보존돼 있으므로 **절단된 요약이 아닌 전체 맥락**을 기반으로 판단한다.

**핵심 원칙**: 의미 판단(type·label·confidence·relations)은 100% 당신(Claude 본체)이 담당한다. 코어 모듈은 저장·투영만 한다.

## 실행 절차

### 1. 미처리 번들 목록 조회

```bash
bun run bin/cfgm-list-bundles.ts --unprocessed --json
```

출력: 번들 메타와 파일 경로 배열. `activeProblemId === null`은 orphan 번들이며 별도 귀속 판단이 필요하다.

문제 한정 조회:
```bash
bun run bin/cfgm-list-bundles.ts --unprocessed --problem <problemId> --json
```

### 2. 각 번들 분석

번들 파일을 직접 Read 툴로 읽는다 (`.memory-brain/ledger/bundles/<YYYY>/<MM>/<DD>/<bundleId>.json`). 각 번들에는:
- `observations`: 이 턴에서 발생한 정규화된 관측 전문 (절단 없음)
- `metrics`: 턴 내 구조적 통계 (frequency·exit code·promptCount)
- `recentBlockIds`: 해당 problem의 최근 블록 (맥락)
- `activeProblemId`: 귀속 문제 ID (orphan은 `null`)

### 3. Flow Block 합성 판단

**Block type 13종** (하나만 선택):
- `Problem` / `State` / `Trigger` / `Context` / `Constraint`
- `Cause` / `Hypothesis` / `Action` / `Evidence` / `Outcome`
- `Rule` / `Gap` / `Question`

**판단 원칙**:
- 한 관측이 **여러 블록**을 만들 수 있다 (예: Edit 하나 = Action + Evidence)
- **노이즈면 블록을 만들지 않는다** — 모든 툴 호출이 의미 있는 블록은 아님
- Orphan 번들: 내용을 보고 어느 problem에 귀속할지 판단. 귀속 부적합이면 discard 결정

### 4. Confidence 기준표

| 범위 | 기준 |
|---|---|
| `0.9~1.0` | 직접 증거 있음, 재현 완료 |
| `0.7~0.9` | 명시적 증거 있음, 미재현 |
| `0.5~0.7` | 추론, 부분 증거 |
| `0.3~0.5` | 가설, 간접 증거 |
| `< 0.3` | 블록으로 만들지 말고 Question으로 변환 |

### 5. 관계 부착

`relations` 종류:
- `causes` — A → B의 인과
- `evidencedBy` — 근거 관계
- `mitigatedBy` — 완화
- `validatedBy` — 검증
- `followsFrom` — 시간적/논리적 후속

관계는 방향성이 중요. 불필요하게 양방향 만들지 않는다.

### 6. label 작성

- 한 줄 (줄바꿈 없음)
- 의미 보존 (절단 금지)
- 한국어/영어 자유. 검색 가능성 고려

### 7. 델타 커밋

각 블록·관계·cue card 재생성을 FlowDelta로 만들어 stdin으로 파이프한다:

```bash
echo '{"op":"block-add","timestampIso":"...","block":{...}}' | bun run bin/cfgm-apply-delta.ts
```

또는 배열로 일괄:

```bash
cat delta-batch.json | bun run bin/cfgm-apply-delta.ts
```

Delta 스키마 (모든 op에 `problemId` 필수 — `block-add`는 `block.problemId`):

```ts
| { op: "block-add"; timestampIso; block }
| { op: "block-supersede"; timestampIso; problemId; blockId; supersededBy; reason }
| { op: "relation-add"; timestampIso; problemId; fromBlockId; relation }
| { op: "cue-card-regen"; timestampIso; problemId; bodyHash; bodyBytes }
```

검증 실패 시 stderr로 이유 출력, exit=1. 스킬은 이를 보고 판단을 수정한다.

### 8. Cue Card 재작성

블록 변경 후 해당 problem의 cue card를 재작성한다:
- 경로: `.memory-brain/problems/<problemId>/cue-card.md`를 Write 툴로 쓴다
- YAML 프론트매터의 `awaitingSynthesis`를 `false`로
- 바디는 자유 형식이나 권장 기본 섹션: `## 핵심 문제` / `## 원인 사슬` / `## 현재 상태` / `## 남은 결손`
- **soft 예산 4KB 준수**, 6KB 초과 절대 금지
- 재작성 후 `cue-card-regen` 델타로 `bodyHash` (SHA-256 hex)와 `bodyBytes` 기록

### 9. Ontology 모듈 갱신 (Epic 4)

이번 합성에서 추가한 블록 타입 빈도를 `bin/cfgm-ontology-record.ts`로 기록한다.
해당 problem의 `ontology.module.yaml`이 없으면 `general-task`로 자동 생성된다.

```bash
echo '{"blockTypeCounts":{"Action":1,"Outcome":1}}' | \
  bun run bin/cfgm-ontology-record.ts --problem <problemId>
```

문제가 해결 완료됐다고 판단되면 (Outcome positive + 더 이상 열린 Gap 없음 등) `--resolve` 추가:

```bash
echo '{"blockTypeCounts":{}}' | \
  bun run bin/cfgm-ontology-record.ts --problem <problemId> --resolve
```

`resolvedRuns`가 3에 도달하면 승격이 자동 트리거된다.
Step 11 결과 요약에 `resolvedRuns` 값과 승격 여부를 포함한다.

### 10. 번들 처리 완료 마킹

```bash
bun run bin/cfgm-apply-delta.ts --mark-processed <bundleId>
```

모든 번들 처리 완료 후 `bun run bin/cfgm-list-bundles.ts --unprocessed`로 확인.

### 11. 결과 요약

사용자에게 stdout으로 보고:
- 처리한 번들 수
- 추가한 블록 수 (타입별)
- 관계 수
- cue card 재작성 여부
- 이상 상황 (discard, 검증 실패 등)

## Gap 블록 생성 규칙 (Epic 3)

- `type: "Gap"`, `detectorId: "semantic"` — 구조적 `rule:*`는 코어가 자동 산출하므로 직접 생성 금지
- `subject.blockId` 필수 — 결손이 지시하는 기존 블록
- `severity`: 0.0~1.0 (얼마나 시급한 결손인지)
- `semanticBoost` 선택 — 이 Gap이 특히 중요하면 0.5~1.0 부여 (VOI 가중)
- `blockId` 규약은 자유이나 `gap:semantic:<subject>` 패턴 권장

## Question 블록 생성 규칙 (Epic 3)

- `type: "Question"`, `gapBlockId` 필수 — 대응하는 Gap의 blockId
- `relations`에 `{ kind: "followsFrom", targetBlockId: <gapBlockId>, confidence: 1.0 }` 부착 권장
- `label`: 500바이트 이내 — 초과 시 UserPromptSubmit 훅이 주입을 스킵하고 오류 로그 남김
- `problemId`: 대응 Gap과 동일해야 한다
- `confidence: 1.0` (Question은 사실 기록, 가설 아님)

## Answer 기록 규칙 (Epic 3)

Question에 답이 된 관측이 bundle에 있으면:
1. 답변 내용에 대응하는 블록(Evidence/Outcome/Cause 등)을 `block-add`
2. Question을 `block-supersede`로 마감 — `supersededBy`는 답변 블록 blockId, `reason: "answered"`
3. 연관 Gap이 해소됐으면 semantic Gap도 `block-supersede`로 마감 (구조적 Gap은 projection에서 자동 제거)

## Question 리프레이즈 규칙 (Epic 3)

- 기존 Question 문구를 고치려면 기존 Question을 `block-supersede`(`reason: "rephrased"`) + 새 Question `block-add`
- 새 Question의 `gapBlockId`는 원본과 동일해야 한다
- 텍스트 유사도 판정이 아닌 `block-supersede`를 통한 명시적 교체

## 금지 사항

- 번들 관측의 내용을 절단·키워드 매칭 후 type을 결정하지 않는다 — 전체를 읽고 판단
- Confidence를 임의 고정값(0.5 등)으로 일괄 부여하지 않는다 — 맥락별 판단
- cue card 바디에 시간표·할 일 목록·사용자에 대한 지시를 쓰지 않는다 — 이 스킬은 기술적 지식 저장만 담당
- 의미 없는 모든 툴 호출을 블록으로 만들지 않는다 — 노이즈는 버린다
- 구조적 Gap(`detectorId: "rule:*"`)을 수동으로 `block-add`하지 않는다 — projection에서 자동 생성됨
