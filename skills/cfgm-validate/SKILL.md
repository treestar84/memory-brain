---
name: cfgm-validate
description: 현재 활성 문제(또는 지정한 문제)의 FlowGraph를 shacl-lite 규칙으로 검증하여 구조적 위반 리포트를 출력한다.
---

# /cfgm-validate

**역할**: FlowGraph의 구조적 건전성을 검사한다. orphan Question, 끊어진 supersede 체인, 출처 없는 Cause/Hypothesis 등을 탐지하고 `state/validation-report.json`에 결과를 저장한다.

**검증 규칙** (`governance/shacl-lite.yaml` 기준):

| Rule ID | 유형 | 심각도 | 설명 |
|---|---|---|---|
| `orphan-question` | orphan-check | error | Question.gapBlockId가 존재하지 않는 Gap을 참조 |
| `broken-supersede-chain` | supersede-chain | error | supersededBy가 유효하지 않은 blockId |
| `cause-needs-provenance` | provenance-check | warning | Cause.supportedBy가 비어 있음 |
| `hypothesis-needs-provenance` | provenance-check | warning | Hypothesis.supportedBy가 비어 있음 |

> 프로젝트 `.memory-brain/governance/shacl-lite.yaml`이 있으면 해당 규칙을 우선 사용한다.

## 실행

```bash
# 활성 문제 검증 (기본)
bun run bin/cfgm-validate.ts

# 특정 문제 지정
bun run bin/cfgm-validate.ts --problem <problemId>

# JSON 출력 (CI/스크립팅용)
bun run bin/cfgm-validate.ts --json
```

## 출력 예시

```
## 검증 결과: prob-abc12345
상태: ❌ 오류 있음
오류: 1건  경고: 2건

❌ [orphan-question] [q1] Question block references a non-existent Gap via gapBlockId
⚠️ [cause-needs-provenance] [c1] Cause block has no supportedBy evidence
⚠️ [hypothesis-needs-provenance] [h1] Hypothesis block has no supportedBy evidence

리포트 저장: .memory-brain/state/validation-report.json
```

## 규칙 커스터마이징

`.memory-brain/governance/shacl-lite.yaml`을 생성하면 기본 규칙을 오버라이드한다:

```yaml
version: "shacl-lite@1.0.0"
rules:
  - id: must-have-problem-block
    type: required-block-type
    blockType: Problem
    minCount: 1
    severity: error
    message: "FlowGraph must contain at least one Problem block"
```

## cfgm-process와의 관계

`/cfgm-process` Step 11 완료 후 자동으로 검증이 실행된다. 검증 결과는 요약에 포함되며, error가 있으면 해당 항목을 수정 후 재처리를 권장한다. 검증 실패가 처리 중단을 일으키지는 않는다.

## 종료 코드

- `0`: 유효 (error violation 없음, warning은 허용)
- `1`: 오류 있음 또는 스냅샷/문제 없음
