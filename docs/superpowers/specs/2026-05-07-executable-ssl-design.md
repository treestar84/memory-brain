# V3.24 Executable SSL — Design Spec

> 작성일: 2026-05-07
> 상태: approved
> 관련 PR: V3.24

## 배경

SSL JSON은 현재 라우팅·발견·거버넌스용 메타데이터로만 쓰인다.
SKILL.md는 실행 지시(how)를 담은 source-of-truth다.

이 PR은 SSL에 `logical[].instructions` 슬롯을 추가해 SSL이
**발견 메타 + 실행 프로그램**을 동시에 담도록 한다.
SSLRunner가 그래프를 traverse하며 실행 계획을 생성하거나
interactive 모드로 단계별 안내한다.

## 목표

- SSL JSON만으로 스킬을 실행 가능하게 한다 (SKILL.md는 authoring 원본으로 유지)
- InteractionNode/DecisionNode가 런타임에 실제로 동작한다
- cfgm-replay와 자연스럽게 연동된다 (실행 결과 → replay 파일)

## 비목표

- SKILL.md 폐기: 여전히 authoring source-of-truth
- 외부 API 호출 / LLM API 직접 호출
- MCP 의존성

---

## 1. Schema 확장 — ssl.ts v0.3.1

### 변경 사항

```typescript
// LogicalNode에 추가 (optional)
instructions?: string   // 자연어 실행 지시. LLM/사람이 따라 수행.
```

- SSL_VERSION: `"0.3.0"` → `"0.3.1"` (minor, back-compat)
- `validateSSL`: `instructions` 없어도 통과 (optional)
- 기존 11개 SSL JSON: 변경 불필요

### instructions 작성 규칙

- 자연어 markdown, 1-5문장
- 구체적 명령어/값 포함 권장 (예: `bun add html-to-image`)
- actionRef와 일관성 유지 (WRITE_LOCAL_FILE → 파일 경로 명시)
- "무엇을" 아닌 "어떻게"에 집중

---

## 2. SSLRunner (`src/core/runner/SSLRunner.ts`)

### 핵심 타입

```typescript
type StepKind = "collect" | "branch" | "execute" | "parallel-execute"

interface Step {
  kind: StepKind
  sceneId: string
  // collect: InteractionNode
  interactionNode?: InteractionNode
  // branch: DecisionNode
  decisionNode?: DecisionNode
  // execute / parallel-execute: LogicalNode[]
  logicalNodes?: LogicalNode[]
}

interface RunState {
  inputs: Record<string, string>     // InteractionNode 응답
  decisions: Record<string, string>  // DecisionNode 선택 결과
  completedEffects: string[]         // 완료된 effects
}

interface RunResult {
  steps: Step[]
  state: RunState
  skillSlug: string
}
```

### 동작 알고리즘

1. `structural[]`을 `transitionsTo` 따라 topological sort → scene 순서 결정
2. 각 scene을 순회:
   - `interactions[]` 중 `scopeRef`가 현재 scene인 것 → `CollectStep`
   - `decisions[]` 중 `scopeRef`가 현재 scene인 것 → `BranchStep`
   - `scene.containsLogicalIds`에 해당하는 `logical[]` → `ExecuteStep`
     - 동일 scene 내 logical 노드 간 effect 의존성 없으면 → `ParallelExecuteStep`
3. state는 순회 중 누적

### 병렬 감지 로직

같은 scene 내 logical 노드 A, B가 있을 때:
- A의 `effects`가 B의 `resourceTarget`에 없으면 → 병렬 가능
- 그렇지 않으면 → 순차

---

## 3. cfgm-run CLI (`bin/cfgm-run.ts`)

### 사용법

```bash
# Plan generator (기본)
bun cfgm-run --skill app-store-screenshots

# Interactive 모드
bun cfgm-run --skill app-store-screenshots --interactive

# 중단된 실행 재개
bun cfgm-run --skill app-store-screenshots --state .run-state.json

# Machine-readable
bun cfgm-run --skill app-store-screenshots --json
```

### Plan generator 출력 (기본)

```markdown
# Execution Plan: app-store-screenshots

## Scene 1 — REASON: Collect app assets, brand identity...
### [COLLECT] User Input Required
> Before writing any code, I need to ask you...

### [EXECUTE] Infer design decisions
- actionRef: INFER_FROM_MEMORY
- instructions: Infer background style, decorative elements...

## Scene 2 — PREPARE: Scaffold Next.js project...
### [PARALLEL] Execute simultaneously:
  - [EXECUTE] Scaffold Next.js: `bunx create-next-app@latest ...`
  - [EXECUTE] Write layout.tsx with font configuration
...
```

저장: `memory/_pending/replay/<slug>.run-plan.md`

### Interactive 모드 동작

```
[STEP 1/7] COLLECT — Scene: Collect app assets...

> Before writing any code, I need to ask you...
Your answer: _
```

- 각 CollectStep에서 `readline` 입력 대기
- BranchStep에서 번호 선택 제시
- ExecuteStep에서 instructions 출력 후 "Done? (y/n)" 확인
- 완료 시 state를 `memory/_pending/replay/<slug>.replay.md`에 저장

---

## 4. app-store-screenshots.json instructions 채우기

logical 7노드에 각각 `instructions` 추가:

| 노드 | instructions 요약 |
|---|---|
| logical:1 | 7개 필수 질문을 사용자에게 순서대로 물어볼 것 |
| logical:2 | 답변에서 배경 스타일·타이포·RTL 여부를 결정할 것 |
| logical:3 | `bunx create-next-app` + `bun add html-to-image` 실행 |
| logical:4 | `src/app/layout.tsx`에 폰트 설정 작성 |
| logical:5 | 슬라이드 수·순서·메시지·디바이스 프레임 구성 계획 수립 |
| logical:6 | `src/app/page.tsx` 전체 구현 (slide factory, theme, base64 preloader) |
| logical:7 | `toPng()`를 두 번 호출 — 첫 호출 워밍업, 두 번째가 실제 출력 |

---

## 5. 테스트

| 파일 | 커버리지 |
|---|---|
| `tests/core/runner/SSLRunner.test.ts` | plan 생성, 병렬 감지, state 추적, 빈 interactions/decisions |
| `tests/bin/cfgm-run.test.ts` | plan-generator 스모크 (app-store-screenshots 대상) |

---

## 파일 목록

```
src/core/ontology/ssl.ts              (수정: instructions 필드 + v0.3.1)
src/core/runner/SSLRunner.ts          (신규)
bin/cfgm-run.ts                       (신규)
memory/concepts/_ssl/app-store-screenshots.json  (수정: instructions 채움)
tests/core/runner/SSLRunner.test.ts   (신규)
tests/bin/cfgm-run.test.ts            (신규)
```

## 성공 기준

- `bun cfgm-run --skill app-store-screenshots` 실행 시 전체 실행 계획 출력
- `--interactive` 모드에서 InteractionNode 응답 수집 후 replay 파일 생성
- `validateSSL` 통과 (기존 11개 SSL + app-store-screenshots)
- 전체 테스트 866+ pass, 회귀 0건
