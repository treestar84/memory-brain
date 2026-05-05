# Canonical Store 후보 — 11 BMAD skill 분석 결과 (V3.17 시드 proposal)

> **본 파일의 목적**: 사용자 검토용 proposal artifact. 본 PR (V3.16.x) 에서는 코드/스키마 변경 없음. 사용자가 본 파일의 후보를 OK 하면 PR-V3.17 (SSL 0.3.0 + Canonical Store 구현) 의 시드로 사용.

## 분석 입력

- 11 SSL JSON (.claude/skills/bmad-* 11 건, 모두 PAI 세션이 generatedBy:"llm" 으로 정규화)
- 총 125 Logical node, 54 Structural scene
- 평균 11 logical / skill, 5 scene / skill

## 핵심 발견

### 1. **Action signature 는 강하게 집중** — canonical 화 가치 큼

| signature | 빈도 | 전체 비율 |
|---|---|---|
| `INFER / MEMORY` | 29 | 23% |
| `EMIT / MEMORY` | 21 | 17% |
| `BRANCH / MEMORY` | 19 | 15% |
| `TRANSFORM / MEMORY` | 15 | 12% |
| `READ / LOCAL_FS` | 14 | 11% |
| `WRITE / LOCAL_FS` | 8 | 6% |
| `BRANCH / LOCAL_FS` | 6 | 5% |
| `READ / MEMORY` | 5 | 4% |
| `CALL_TOOL / LOCAL_FS` | 5 | 4% |
| 그 외 (CALL_TOOL/NET, WAIT 등) | 3 | 3% |

→ **상위 5 패턴이 78% 커버**. canonical 5-7 개 만들면 logical 노드의 대부분이 `$ref` 로 표현 가능.

### 2. **Effects 는 거의 unique** — canonical 화 부적합

134 unique effects. 가장 빈도 높은 것도 3 회 (`content_type_identified`). 대부분 도메인-specific. → canonical 화하면 의미 손실. inline 유지가 맞음.

### 3. **resourceTarget 도 대부분 unique** — 일부만 가치

10× `content_input` (4 skill 공유), 2× `_bmad/core/config.yaml` (진짜 공유 자원). 나머지는 1-2 회 등장하는 unique 식별자. → 진짜 공유 자원 (예: BMAD config) 만 canonical.

### 4. **Scene 사용 패턴**: PREPARE vs ACQUIRE 모호

PREPARE 5 회, ACQUIRE 12 회. config 로딩 같은 작업이 두 scene 에 혼재. → vocabulary.yaml 의 정의 강화 + LLM 가이드 필요.

```
ACQUIRE 12   ←  데이터 가져오기 (외부 read 위주)
REASON  10   ←  분석/결정
ACT     10   ←  주 작업 실행
FINALIZE 9   ←  마무리/return
VERIFY   7   ←  검증
PREPARE  5   ←  setup (구분 모호)
RECOVER  1   ←  거의 사용 안 됨 — error path 표현 부족 시그널
```

## 제안 — V3.17 Canonical Store 시드 (5-7 개)

### canonical actions

| ID | action | resources | 일반 description (canonical) |
|---|---|---|---|
| `INFER_FROM_MEMORY` | INFER | [MEMORY] | "Reason / classify / decide based on in-process state" |
| `EMIT_TO_MEMORY` | EMIT | [MEMORY] | "Produce signal / event / message into MEMORY (e.g., user prompt, log entry)" |
| `BRANCH_ON_MEMORY` | BRANCH | [MEMORY] | "Conditional path selection based on in-process state" |
| `TRANSFORM_IN_MEMORY` | TRANSFORM | [MEMORY] | "Map / reshape data without I/O" |
| `READ_LOCAL_FILE` | READ | [LOCAL_FS] | "Read a file from local filesystem" |
| `WRITE_LOCAL_FILE` | WRITE | [LOCAL_FS] | "Persist data to a local file" |
| `CALL_LOCAL_SCRIPT` | CALL_TOOL | [LOCAL_FS] | "Invoke a local script / executable" |

→ 7 개. 위 빈도 표의 상위 7 패턴 = logical 노드 117/125 = **94% 커버**.

### canonical resource targets (선택, 1-2 개만)

| ID | resourceTarget pattern | 사용 skill |
|---|---|---|
| `BMAD_CORE_CONFIG` | `_bmad/core/config.yaml` | bmad-brainstorming 등 2+ |

→ 사용자 프로젝트 별 진짜 공유 자원만. 1차는 1 개로 시작.

### Canonical 안 할 것 (명시적 결정)

- **effects** — 거의 unique, 도메인 의미 손실 risk. inline 유지.
- **개별 skill 의 unique resourceTarget** — 그 skill 의 정체성. inline 유지.
- **sceneGoal** — natural language 변동성 큼. inline 유지.

## V3.17 진행 시 활용 흐름 (proposal)

1. canonical store 파일: `memory/concepts/_ssl/_canonical/actions.yaml`. 위 7 항목 + 추후 dedup detector 가 추가 발견하는 항목.
2. SSL document 의 logical 노드:
   ```jsonc
   { "id": "skill#l:1", "$ref": "actions.READ_LOCAL_FILE", "resourceTarget": "_bmad/core/config.yaml", "effects": ["config_loaded"] }
   ```
   → action / resources 는 ref 가 가져옴. resourceTarget / effects 는 inline.
3. `validateSSL` 가 ref 해석 + canonical store 와 cross-check. 일치 안 하면 schema error.
4. PAI 세션의 `_spec/prompt.md` 에 "canonical 매치되면 ref 의무" 추가.
5. dedup detector: 새 skill 정규화 시 inline action 패턴이 canonical store 와 매치되면 자동으로 ref 로 치환 (또는 warning).
6. governance reports 에 6 번째 detector `canonical-candidates.md` 추가 — 운영 중 N≥3 회 등장하는 inline 패턴 자동 발견.

## 비용 추정

- canonical store 7 항목 = ~70 라인 yaml. 무시 가능.
- LLM 처리 시 추가 system prompt 토큰 ~500. cache_control 적용 시 첫 호출만 비용.
- SSL JSON 평균 크기 추정: logical 노드 1 개당 약 60% 토큰 절약 (action/resources/description 일부 중복 제거) → 전체 SSL 약 30-40% 축소.
- LLM 처리 시간: action 어휘 학습 비용 상쇄 효과. 대략 ±20% 이내.

## 사용자 결정 필요

1. **위 7 개 canonical action 을 시드로 채택?** (a) Yes / (b) 가지치기 (5 개로 줄이기, 어떤 것?) / (c) 추가
2. **`BMAD_CORE_CONFIG` 같은 도메인 resourceTarget 도 canonical 에 포함?** (a) Yes / (b) actions 만 / (c) 사용자 별 결정 (이 프로젝트는 BMAD 라 포함)
3. **V3.17 본격 진행 OK?** — 4 노드 (Decision / Interaction / Evidence / Protocol) + canonical store + dedup detector 한 PR 로.

이 3 가지 결정 주시면 V3.17 즉시 시작합니다.
