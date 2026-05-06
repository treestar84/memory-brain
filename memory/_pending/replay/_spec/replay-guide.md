# Replay Guide — SSL-guided Workflow Execution

> host LLM 이 `memory/_pending/replay/*.replay.md` 파일을 읽고 워크플로우를 재실행하는 방법.
>
> 이 파일은 명세(spec)다 — 실행 코드가 아니라 자연어 지침.

## 전제

- replay plan 파일은 `cfgm-replay` CLI 가 생성한다.
- host LLM(Claude Code 또는 동등한 host)이 이 spec을 읽고 plan 파일을 단계별로 실행한다.
- 직접 LLM API 호출 없음. host LLM 의 구독 auth 채널을 그대로 사용한다.

## 실행 절차

### 1. Plan 파일 찾기

```
memory/_pending/replay/<slug>.replay.md
```

파일 frontmatter:
```yaml
replay_for: <slug>
status: ready | in_progress | done | failed
```

`status: ready` 인 파일만 실행한다. 이미 `done` 이면 건너뛴다.

### 2. Plan 읽기

plan 파일은 Scene 섹션으로 구성된다:

```
### Scene: PREPARE — <sceneGoal>
### Scene: ACQUIRE — ...
### Scene: ACT — ...
...
```

SSL 의 SCENES 상수 순서(PREPARE → ACQUIRE → REASON → ACT → VERIFY → RECOVER → FINALIZE)로 정렬되어 있다.

### 3. Scene 순서대로 실행

각 Scene 내에서:

#### Logical Actions (필수 실행)
```
**Logical Actions:**
1. `[READ MEMORY]` 설명 — Resources: MEMORY — Effects: ...
2. `[WRITE LOCAL_FS]` 설명 — Resources: LOCAL_FS — Effects: ...
```
- 번호 순서대로 실행한다.
- action type(`READ`, `WRITE`, `CALL_TOOL` 등)을 보고 적절한 tool 을 선택한다.
- effects 를 보고 실행 결과를 확인한다.

#### Decisions (조건 분기)
```
**Decisions:**
- **Q: <question>**
  - If <condition> → <action or next scene>
  - Fallback: <action>
```
- 조건을 평가한다.
- 매칭되는 branch 의 action 을 실행하거나 지정된 scene 으로 이동한다.
- 어떤 branch 도 매칭 안 되면 fallback 을 실행한다.

#### Interactions (사용자 발화 — 일시 정지)
```
**Interactions (pause for user):**
- Ask: "질문 텍스트 {variable}"
  - Expected: yes-no | free-text | selection
  - Options: [A, B, C]
```
- 사용자에게 발화한다.
- 응답을 받아 {variable} 에 바인딩한다.
- 이후 Logical Actions 나 Decisions 에서 해당 변수를 사용한다.

#### Protocols (위임)
```
**Protocols (delegate):**
- Delegate to `<skill-slug>` when: <condition>
  - Pass: [input1, input2]
  - Expect back: [output1, output2]
```
- condition 이 충족되면 해당 skill 을 호출한다.
- Pass 목록의 값을 인자로 전달한다.
- Expect back 목록의 결과를 수신한다.

### 4. 성공 기준 검증

Plan 파일 하단의 `## 성공 기준` 섹션을 확인한다:

```markdown
- [ ] 항목 1
- [ ] 항목 2
```

각 항목을 검증하고 완료 시 `[x]` 로 표시한다.

### 5. Plan 상태 갱신

실행 시작 시:
```yaml
status: in_progress
started_at: <ISO timestamp>
```

완료 시:
```yaml
status: done
completed_at: <ISO timestamp>
```

실패 시:
```yaml
status: failed
failure_reason: <간단한 설명>
```

## action type → tool 매핑

| Action | 권장 tool |
|--------|-----------|
| READ | Read, Bash(cat), Grep |
| WRITE | Write, Edit, Bash |
| CALL_TOOL | 해당 tool 직접 호출 |
| INFER | LLM 추론 (자체 inference) |
| EMIT | 사용자에게 출력 |
| WAIT | 사용자 응답 대기 (Interaction 과 동일) |
| BRANCH | Decision 노드로 처리 |
| SCHEDULE | cron / launchd 명령 또는 메모 |
| TRANSFORM | 변환 로직 실행 (Bash, script) |

## SKILL.md 단독 대비 차이점

| 항목 | SKILL.md 단독 | SSL replay plan |
|------|--------------|----------------|
| 실행 순서 | prose 해석 의존 | Scene DAG 명시 |
| 분기 | 암묵적 | Decision when/then |
| 사용자 pause | 불명확 | Interaction 명시 |
| 성공 기준 | 없음 | Evidence successCriteria |
| 위임 | 없음 | Protocol delegateTo |

## 관련 CLI

```sh
# 워크플로우 학습 (→ memory/workflows/<slug>.md + SSL enqueue)
bun run learn --name <slug> --goal "한 줄 목표"

# Replay plan 생성 (→ memory/_pending/replay/<slug>.replay.md)
bun run replay --slug <slug>
bun run replay --query "검색어"
bun run replay --list
```
