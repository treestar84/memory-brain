# 메모리 시스템 프로젝트 반영/개선 요청 프롬프트

> 목적: 이 문서는 현재 진행 중인 **개인화된 파일 기반 AI 메모리 시스템 프로젝트**에 대해, 지금까지 논의한 핵심 인사이트와 의사결정 사항을 반영하여 설계·구현·리팩터링을 요청하기 위한 실행형 프롬프트다.  
> 이 프롬프트는 Claude Code, Codex, OpenClaw, OpenCode, 기타 에이전트 코딩 도구에 그대로 전달할 수 있도록 작성한다.

---

## 0. 당신의 역할

당신은 다음 역할을 동시에 수행한다.

1. **상위 1% AI 에이전트 메모리 아키텍트**
2. **Claude Code / OpenClaw / Hermes / PAI 계열 에이전트 시스템 분석가**
3. **파일 기반 메모리 시스템 설계자**
4. **사용자 개인화·페르소나 모델링 시스템 설계자**
5. **중복·충돌·오래된 기억을 관리하는 memory governance 엔지니어**
6. **장기적으로 발명성 있는 Personal Memory OS를 설계하는 공동 창업자**

이 프로젝트는 단순한 `MEMORY.md` 관리 도구가 아니다.  
목표는 **Claim-Grounded, Persona-Aware Memory Routing OS**를 만드는 것이다.

---

## 1. 프로젝트 배경

현재 프로젝트는 Claude Code, OpenClaw, Hermes, PAI 같은 에이전트 환경에서 사용할 수 있는 장기 메모리 시스템이다.

초기 핵심 인사이트는 다음과 같다.

```text
CLAUDE.md / MEMORY.md를 거대한 기억 저장소로 쓰면 안 된다.
그것은 memory bootloader여야 한다.

ROUTER.md는 지식 목록이 아니라 retrieval policy여야 한다.

index.md는 전체 지식의 지도다.
너무 커지면 domain index로 쪼갠다.

topic file은 canonical knowledge page다.
중복 내용은 append가 아니라 upsert / merge / supersede해야 한다.

source file은 evidence다.
답변의 신뢰성은 source/evidence로 결정한다.

search index는 파생물이다.
깨지면 markdown source에서 다시 빌드할 수 있어야 한다.

persona model은 별도 layer다.
Honcho식 inferred profile은 개인화에는 쓰되, 검증된 fact로 취급하지 않는다.

memory governance는 필수다.
중복, stale, contradiction, decay, deletion, review queue를 관리해야 한다.
```

이 원칙을 프로젝트 전반에 반영하라.

---

## 2. 반드시 반영해야 할 의사결정

### 2.1 Honcho는 반드시 사용한다

Honcho는 이 프로젝트에 매우 적합한 라이브러리로 판단한다.  
따라서 Honcho는 선택 사항이 아니라 **핵심 구성 요소**로 포함한다.

단, Honcho의 역할을 정확히 분리해야 한다.

```text
Honcho의 역할:
- 사용자/에이전트/관계에 대한 동적 representation layer
- 사용자 선호, 목표, 커뮤니케이션 스타일, 반복 패턴 추론
- session summary / peer representation / derived conclusions 관리
- 개인화 context를 just-in-time으로 제공

Honcho가 하지 말아야 할 역할:
- canonical project knowledge의 유일한 source of truth
- 검증된 기술 결정의 최종 원장
- 모든 메모리 파일을 대체하는 저장소
- evidence 없이 추론을 fact로 승격하는 장치
```

Honcho는 **persona / personalization / user modeling layer**로 사용한다.  
프로젝트 지식, 기술 결정, 아키텍처 결정, 출처 기반 기억은 별도의 파일 기반 canonical memory layer에서 관리한다.

---

### 2.2 OpenClaw / Hermes / PAI의 장점을 적극 계승한다

이 프로젝트는 처음부터 독자 설계만 하지 않는다.  
이미 검증되고 있는 유명 오픈소스들의 memory routing, memory search, user modeling, context injection 구조를 최대한 흡수한다.

#### OpenClaw에서 계승할 것

OpenClaw 계열에서 특히 다음을 계승한다.

```text
- Markdown 기반 source of truth
- memory_search / memory_get 개념
- memory-wiki 계층
- structured claims
- evidence pointer
- contradiction tracking
- freshness tracking
- compiled digest
- wiki_search / wiki_get / wiki_apply / wiki_lint 유사 도구
- dreaming / consolidation 개념
```

OpenClaw식 설계는 이 프로젝트의 **canonical knowledge + governance layer**에 가장 적합하다.

#### Hermes에서 계승할 것

Hermes 계열에서 다음을 계승한다.

```text
- 작은 hot memory
- agent-curated memory
- session search
- periodic memory nudge
- self-improving skill loop
- Honcho 기반 user modeling
- session summary
- user representation
- peer representation
```

Hermes식 설계는 이 프로젝트의 **hot memory + user continuity + personalization layer**에 적합하다.

#### PAI에서 계승할 것

PAI 계열에서 다음을 계승한다.

```text
- 초기 persona / identity / goal awareness
- Claude Code hook 기반 context injection
- SessionStart와 UserPromptSubmit 단계 분리
- 사용자 정체성, 목표, 선호를 에이전트 동작에 반영
- 개인 AI 인프라로서의 운영 철학
```

단, PAI처럼 초기에 과도한 context를 대량 주입하는 방식은 피한다.  
초기에는 **bootloader + identity summary + routing policy**만 넣고, 나머지는 요청별 context routing으로 가져온다.

---

## 3. 최상위 설계 원칙

### 3.1 메모리는 저장소가 아니라 운영체제다

이 프로젝트는 다음 4가지를 분리해야 한다.

```text
1. 무엇을 기억하는가
2. 어디에 저장하는가
3. 언제 다시 불러오는가
4. 어떻게 갱신하고 폐기하는가
```

단순히 `memory.md`에 적는 방식은 금지한다.

---

### 3.2 기억은 claim 단위로 관리한다

중복·충돌·오래된 정보 문제를 해결하려면 기억을 문장 덩어리가 아니라 **claim** 단위로 관리해야 한다.

각 claim은 최소한 다음 속성을 가져야 한다.

```yaml
id: claim.project.memory_os.routing_policy
type: architecture_decision
status: active
confidence: high
created_at: 2026-04-26
updated_at: 2026-04-26
text: "ROUTER.md는 지식 목록이 아니라 retrieval policy로 유지한다."
evidence:
  - source: sources/sessions/2026-04-26-memory-router.md
    quote: "ROUTER.md는 지식 목록이 아니라 retrieval policy다."
supersedes: []
related:
  - claim.project.memory_os.bootloader_policy
tags:
  - memory-router
  - retrieval-policy
  - architecture
```

claim은 다음 status를 가질 수 있다.

```text
active
draft
inferred
low_confidence
conflicting
superseded
deprecated
archived
deleted
```

---

### 3.3 모든 추론은 fact와 분리한다

Honcho나 LLM이 추론한 사용자 성향은 유용하지만, 검증된 사실이 아니다.  
따라서 아래처럼 구분한다.

```text
explicit fact:
- 사용자가 직접 말한 것
- source/evidence가 명확한 것

inferred profile:
- 대화 패턴으로 추론한 것
- confidence가 필요한 것
- 사용자가 반박하면 즉시 수정되어야 하는 것

canonical project knowledge:
- 프로젝트에서 확정한 기술/설계/의사결정
- evidence pointer가 필요한 것
```

---

## 4. 목표 아키텍처

아래 구조를 기준으로 현재 프로젝트를 분석하고, 필요한 경우 파일 구조와 코드를 리팩터링하라.

```text
memory-system/
  CLAUDE.md
  MEMORY.md

  memory/
    ROUTER.md

    current.md

    indexes/
      projects.index.md
      concepts.index.md
      decisions.index.md
      personas.index.md
      sources.index.md
      claims.index.md

    projects/
      memory-os.md
      raising-ai-coach.md
      ai-agent-runtime.md

    concepts/
      memory-router.md
      claim-evidence.md
      honcho-user-model.md
      context-routing.md
      memory-governance.md

    decisions/
      architecture-decisions.md
      technology-decisions.md
      rejected-ideas.md

    profile/
      explicit-profile.md
      inferred-profile.md
      communication-style.md
      goals.md
      relationship-model.md
      derived-conclusions.md

    sources/
      sessions/
      documents/
      research/
      raw/

    claims/
      active/
      superseded/
      conflicting/
      inferred/

    reports/
      duplicate-candidates.md
      stale-claims.md
      contradictions.md
      low-confidence.md
      open-questions.md
      decay-report.md
      review-queue.md

    cache/
      agent-digest.json
      honcho-summary.json
      route-cache.json

    indexes-derived/
      memory.sqlite
      vector.index
      graph.db
```

---

## 5. 각 파일/계층의 역할

### 5.1 `CLAUDE.md` / `MEMORY.md`

역할은 memory bootloader다.

포함해야 할 것:

```text
- 이 프로젝트의 메모리 시스템 사용법
- ROUTER.md 위치
- 전체 메모리를 읽지 말라는 규칙
- evidence 우선 원칙
- persona와 fact를 분리하라는 규칙
- routing policy를 따르라는 지침
```

포함하면 안 되는 것:

```text
- 긴 프로젝트 히스토리
- 모든 사용자 선호
- 모든 과거 의사결정
- 모든 topic 목록
- source 전문
```

---

### 5.2 `memory/ROUTER.md`

역할은 retrieval policy다.  
지식 목록이 아니다.

포함해야 할 것:

```text
- 요청 분류법
- 어떤 memory lane을 먼저 볼지
- persona memory를 언제 사용할지
- source/evidence를 언제 열지
- 한 번에 열 파일 수 제한
- 충돌 발생 시 우선순위
- 오래된 정보 처리 규칙
```

포함하면 안 되는 것:

```text
- 모든 topic 파일 목록
- 모든 프로젝트 목록
- 모든 개념 목록
- 구체적 지식 내용
```

---

### 5.3 `indexes/*.index.md`

index는 지도다.  
ROUTER.md가 너무 커지지 않도록 domain별 index로 분리한다.

예:

```text
projects.index.md
- 각 프로젝트의 id, short summary, canonical page path, updated_at

concepts.index.md
- 각 개념의 id, summary, canonical page path, related concepts

decisions.index.md
- 의사결정 id, 상태, 날짜, 관련 프로젝트, evidence path

personas.index.md
- explicit profile / inferred profile / communication style / goals 위치

sources.index.md
- 원본 세션, 문서, 리서치 노트 위치
```

---

### 5.4 `projects/*.md`, `concepts/*.md`, `decisions/*.md`

이 파일들은 canonical knowledge page다.

규칙:

```text
- 중복 내용은 새 파일에 append하지 않는다.
- 기존 claim이 있으면 upsert / merge / replace / supersede한다.
- 각 중요한 문장은 claim id를 가져야 한다.
- evidence pointer를 가진다.
- status와 updated_at을 가진다.
```

---

### 5.5 `profile/*`

이 계층은 개인화와 페르소나를 담당한다.

구분:

```text
explicit-profile.md
- 사용자가 직접 말한 안정적 선호/상황/목표

inferred-profile.md
- Honcho 또는 LLM이 추론한 사용자 모델

communication-style.md
- 답변 언어, 길이, 구조, 선호하는 설명 방식

goals.md
- 장기 목표, 프로젝트 목표, 사업/학습/개발 방향

relationship-model.md
- 사용자와 에이전트의 협업 방식

derived-conclusions.md
- 반복 대화에서 도출된 고차 인사이트
```

주의:

```text
- inferred profile은 fact가 아니다.
- confidence를 반드시 가진다.
- evidence 또는 observation pointer를 가진다.
- 사용자가 반박하면 즉시 수정/삭제 가능해야 한다.
```

---

### 5.6 `sources/*`

source file은 evidence다.  
답변의 신뢰성과 기억의 권위는 source/evidence로 결정한다.

source는 원본에 가까운 형태를 유지한다.

```text
- 원본 대화
- 원본 PRD
- 원본 문서
- 조사 노트
- 의사결정 당시 근거
```

source는 자주 주입하지 않는다.  
검증·충돌 해결·정확한 인용이 필요할 때만 연다.

---

### 5.7 `cache/*`와 derived index

`agent-digest.json`, `memory.sqlite`, `vector.index`, `graph.db` 등은 모두 파생물이다.

규칙:

```text
- 깨지면 markdown source에서 다시 빌드 가능해야 한다.
- 파생 index가 source of truth가 되면 안 된다.
- index 생성 스크립트 또는 rebuild 명령을 제공해야 한다.
```

---

## 6. Memory Routing 설계

라우팅은 파일명이 아니라 **lane** 단위로 해야 한다.

### 6.1 요청 분류

사용자 요청은 먼저 아래 중 하나 이상으로 분류한다.

```text
QUICK
- 짧은 일반 답변
- 메모리 거의 필요 없음

DEEP
- 복잡한 분석, 설계, 전략
- concepts + decisions + persona 일부 필요

PROJECT
- 특정 프로젝트 관련
- current + projects.index + project canonical page 필요

PERSONAL
- 사용자 상황, 목표, 선호 반영 필요
- explicit profile + inferred profile + goals 필요

VERIFY
- 근거 확인, 충돌 검증, 최신성 확인
- decision log + source/evidence 필요

WRITE
- 새 메모리 저장/갱신 필요
- duplicate detection + claim upsert 필요

CODE
- 코드/레포/구현 작업
- project page + coding style + relevant source 필요

RESEARCH
- 외부 자료/오픈소스/최신 정보 조사
- source/research layer에 저장 후보 생성

CONFLICT
- 기존 기억과 새 정보가 충돌
- contradiction report + supersede flow 필요

MAINTENANCE
- 메모리 정리, 압축, decay, archive, lint
- governance reports 필요
```

---

### 6.2 Memory Lane

라우터는 다음 lane 중 필요한 것만 선택한다.

```text
current lane
- 현재 진행 중인 작업

project lane
- 특정 프로젝트 지식

concept lane
- 일반화된 개념/패턴/설계 원칙

decision lane
- 확정된 의사결정과 근거

persona lane
- 사용자 정체성, 목표, 선호, 커뮤니케이션 스타일

honcho lane
- Honcho derived representation, session summary, peer model

evidence lane
- source file, raw session, original document

governance lane
- duplicate, stale, contradiction, review queue

code lane
- repo, implementation, coding convention

research lane
- 외부 오픈소스, 문서, 조사 결과
```

---

### 6.3 기본 라우팅 순서

```text
1. 요청 분류
2. 필요한 lane 선택
3. current.md 확인
4. 관련 domain index 확인
5. canonical topic/project/decision page 최대 1~3개 조회
6. 부족하면 search index 사용
7. 검증 필요 시 source/evidence 조회
8. 개인화 필요 시 persona/Honcho lane 추가
9. 답변 후 memory update 후보 생성
10. 중복/충돌 검사 후 upsert/merge/supersede
```

---

### 6.4 라우팅 제한

```text
- 한 번에 canonical page는 최대 3개
- source file은 검증 필요 시에만
- archive는 명시 요청 또는 충돌 해결 시에만
- persona memory는 답변 품질에 실제 영향을 줄 때만
- ROUTER.md에는 개별 지식 항목을 추가하지 않음
```

---

## 7. Honcho 통합 요구사항

Honcho는 반드시 사용한다.

### 7.1 Honcho 사용 목적

```text
- 사용자 representation 생성
- agent representation 생성
- peer 관계 모델링
- session summary 생성
- derived conclusions 생성
- 개인화 context 제공
- 반복 대화 패턴 감지
```

### 7.2 Honcho와 파일 메모리의 역할 분리

```text
Honcho:
- personalization
- inferred profile
- conversation-level modeling
- dynamic user representation
- session/peer context

Markdown memory:
- canonical facts
- project decisions
- architecture decisions
- evidence
- claim history
- audit trail
```

### 7.3 Honcho 데이터를 파일 계층에 반영하는 규칙

Honcho 결과를 그대로 fact로 저장하지 말 것.

대신 다음 구조로 변환한다.

```yaml
id: persona.inference.prefers_layered_systems
type: inferred_preference
status: active
confidence: high
updated_at: 2026-04-26
text: "사용자는 단순 구현보다 계층화된 장기 확장 구조를 선호한다."
source:
  kind: honcho_conclusion
  id: honcho.conclusion.2026-04-26-001
evidence:
  - source: sources/sessions/2026-04-26-memory-system.md
routing_use:
  - architecture_design
  - prd_generation
  - long_term_strategy
do_not_use_for:
  - simple_fact_answer
  - raw_calculation
```

---

## 8. 중복 데이터 대응 전략

중복 데이터 대응은 필수다.  
append-only memory는 장기적으로 부패한다.

### 8.1 필수 연산

```text
recall
- 새 기억 후보와 관련된 기존 claim을 검색한다.

compare
- 새 정보가 기존 claim과 같은지, 보강인지, 충돌인지 판단한다.

add
- 기존 claim이 없을 때만 새 claim을 만든다.

merge
- 같은 개념에 대한 보강이면 기존 claim에 병합한다.

replace
- 기존 claim의 내용이 바뀐 경우 active claim을 갱신한다.

supersede
- 과거 정보는 남기되 status를 superseded로 바꾼다.

decay
- 오래되고 조회되지 않는 정보의 우선순위를 낮춘다.

archive
- 기본 검색/라우팅 대상에서 제외한다.

delete
- 사용자가 삭제 요청했거나 민감정보/오류 정보인 경우 실제 삭제한다.
```

---

### 8.2 중복 판단 기준

중복 판단은 단순 문자열 일치로 하지 않는다.

아래 기준을 조합한다.

```text
- claim id 일치
- canonical entity 일치
- project id 일치
- concept id 일치
- semantic similarity
- source/evidence overlap
- updated_at 비교
- status 비교
- confidence 비교
```

---

### 8.3 중복 처리 플로우

```text
새 기억 후보 발생
  ↓
관련 claim 검색
  ↓
유사 claim 존재?
  ├─ 없음 → add
  ├─ 있음 + 같은 의미 → skip 또는 merge
  ├─ 있음 + 보강 정보 → merge
  ├─ 있음 + 변경 정보 → replace
  ├─ 있음 + 충돌 → contradiction report 생성
  ├─ 기존 정보가 오래됨 → supersede 또는 decay
  ↓
canonical page 업데이트
  ↓
index 갱신
  ↓
agent-digest 재컴파일
  ↓
review queue 필요 여부 판단
```

---

### 8.4 Decay 전략

각 claim은 다음 점수를 가질 수 있다.

```yaml
access_count: 12
last_accessed_at: 2026-04-26
updated_at: 2026-04-20
confidence: high
source_authority: explicit_user_statement
freshness_score: 0.91
usefulness_score: 0.82
decay_score: 0.12
```

decay는 삭제가 아니다.  
decay는 기본 라우팅 우선순위를 낮추는 것이다.

삭제는 다음 경우에만 한다.

```text
- 사용자가 명시적으로 삭제 요청
- 민감하거나 잘못 저장된 정보
- 명백히 잘못된 정보
- 보존 가치가 없는 임시 정보
```

---

## 9. Persona / Identity / Goal Layer

PAI의 장점인 초반 persona, identity, goal awareness는 이 프로젝트에 반드시 필요하다.

### 9.1 Identity Layer

다음 내용을 관리한다.

```text
- 사용자의 장기 목표
- 선호하는 설명 방식
- 개발/사업/콘텐츠/학습 방향
- 현재 진행 중인 핵심 프로젝트
- 에이전트에게 기대하는 역할
- 답변 톤과 깊이
```

### 9.2 Agent Persona

에이전트는 단순 비서가 아니다.  
사용자의 공동 창업자, 시스템 아키텍트, 비판적 검토자, 장기 기억 관리자 역할을 수행한다.

다만 persona가 사실 판단을 흐리면 안 된다.

```text
persona는 답변 방식에 영향을 준다.
evidence는 사실 판단에 영향을 준다.
둘은 분리한다.
```

---

## 10. Memory Governance

메모리 시스템에는 반드시 governance 계층이 있어야 한다.

### 10.1 필수 리포트

```text
reports/duplicate-candidates.md
- 중복 가능성이 높은 claim 목록

reports/stale-claims.md
- 오래되었거나 갱신 필요성이 높은 claim 목록

reports/contradictions.md
- 서로 충돌하는 claim 목록

reports/low-confidence.md
- 근거가 약한 inferred claim 목록

reports/open-questions.md
- 사용자의 추가 확인이 필요한 질문 목록

reports/decay-report.md
- decay 대상 및 archive 후보

reports/review-queue.md
- 사람이 검토해야 하는 변경 후보
```

---

### 10.2 Memory Lint

다음 lint 기능을 구현하거나 설계하라.

```text
- ROUTER.md가 너무 커졌는지 검사
- index가 topic file과 불일치하는지 검사
- claim id 중복 검사
- evidence pointer 깨짐 검사
- superseded claim이 active로 남아 있는지 검사
- 오래된 inferred profile 검사
- source 없는 high-confidence claim 검사
- persona inference가 fact로 잘못 승격되었는지 검사
```

---

## 11. Context Injection 전략

### 11.1 SessionStart

SessionStart에는 최소한만 주입한다.

```text
- memory bootloader
- agent identity summary
- current top-level goal
- ROUTER.md 위치
- 전체 메모리 읽지 말라는 규칙
- evidence/persona 분리 원칙
```

절대 하지 말 것:

```text
- 모든 topic file 주입
- 모든 profile 주입
- 모든 project history 주입
- 긴 skill 문서 주입
```

---

### 11.2 UserPromptSubmit

사용자 입력이 들어온 뒤 context router가 작동한다.

```text
1. 요청 분류
2. lane 선택
3. index 조회
4. 필요한 canonical page 선택
5. 필요한 persona/Honcho context 선택
6. 필요한 evidence 조회
7. 최종 context bundle 구성
```

---

### 11.3 Answer 후

답변 후에는 memory update 후보를 만든다.

```text
- 새로 확정된 결정
- 사용자 선호 변경
- 프로젝트 상태 변경
- 기존 claim 수정 필요
- 새 open question
- conflict 발견
```

단, 즉시 저장하지 말고 duplicate/conflict 검사를 거친다.

---

## 12. 구현 요청

현재 프로젝트 코드를 분석하고, 아래 작업을 수행하라.

### 12.1 현재 상태 분석

```text
- 현재 메모리 파일 구조 분석
- CLAUDE.md / MEMORY.md가 너무 비대한지 확인
- 라우터가 지식 목록처럼 변질되어 있는지 확인
- 중복 저장 가능성이 있는지 확인
- persona와 fact가 섞여 있는지 확인
- evidence pointer가 있는지 확인
- search index가 source of truth처럼 쓰이고 있는지 확인
```

### 12.2 목표 구조로 리팩터링

```text
- bootloader 파일 정리
- ROUTER.md를 retrieval policy로 재작성
- indexes 계층 생성
- canonical topic/project/decision page 생성
- profile 계층 분리
- sources 계층 분리
- reports 계층 생성
- cache/derived index 계층 생성
```

### 12.3 Honcho 통합

```text
- Honcho 도입 방식 설계
- workspace / peer / session / message 모델 매핑
- 사용자 peer와 agent peer 분리
- session summary 저장
- derived conclusion을 inferred profile로 반영
- Honcho 결과를 canonical fact로 오인하지 않도록 가드레일 적용
```

### 12.4 중복/충돌 처리 엔진 설계

```text
- claim schema 정의
- claim id 생성 규칙 정의
- duplicate detection 설계
- merge/replace/supersede flow 설계
- contradiction report 생성
- decay/archive 전략 설계
```

### 12.5 라우팅 엔진 설계

```text
- request classifier 설계
- lane selector 설계
- context budget 제한
- source/evidence 조회 조건
- persona/Honcho 조회 조건
- route-cache 설계
```

### 12.6 Governance 도구 설계

```text
- memory_lint
- rebuild_index
- generate_agent_digest
- detect_duplicates
- detect_contradictions
- decay_candidates
- review_queue
```

---

## 13. 산출물 요구사항

작업 후 반드시 다음을 산출하라.

```text
1. 현재 구조 진단 보고서
2. 개선된 목표 아키텍처
3. 파일 트리 제안
4. CLAUDE.md / MEMORY.md bootloader 초안
5. memory/ROUTER.md 초안
6. claim schema
7. Honcho 통합 설계
8. duplicate / conflict / decay 전략
9. context routing flow
10. governance tool 목록
11. 구현 우선순위
12. 위험 요소와 대응책
```

가능하다면 실제 파일까지 생성하라.

---

## 14. 구현 우선순위

### Phase 1. 최소 구조 정리

```text
- CLAUDE.md / MEMORY.md를 bootloader로 정리
- ROUTER.md 생성
- current.md 생성
- indexes 디렉터리 생성
```

### Phase 2. Canonical Memory

```text
- projects / concepts / decisions 분리
- claim schema 적용
- evidence pointer 도입
```

### Phase 3. Routing Engine

```text
- request classifier
- lane selector
- context budget
- index lookup
```

### Phase 4. Honcho Integration

```text
- user peer / agent peer / session mapping
- derived conclusions
- inferred profile 연결
```

### Phase 5. Duplicate & Governance

```text
- duplicate detection
- merge/replace/supersede
- stale/contradiction report
- memory lint
```

### Phase 6. Derived Index & Digest

```text
- sqlite/vector index
- agent-digest.json
- rebuild scripts
- source-of-truth 재빌드 보장
```

---

## 15. 금지 사항

```text
- CLAUDE.md에 모든 지식을 넣지 마라.
- MEMORY.md를 거대한 일기장으로 만들지 마라.
- ROUTER.md에 모든 topic 목록을 넣지 마라.
- Honcho inference를 검증된 fact로 저장하지 마라.
- source/evidence 없는 high-confidence claim을 만들지 마라.
- 중복 발견 시 무조건 append하지 마라.
- search index를 source of truth로 삼지 마라.
- 오래된 정보를 삭제만으로 처리하지 마라. supersede / decay / archive를 우선하라.
```

---

## 16. 최종 설계 문장

이 프로젝트의 최종 방향은 다음 한 문장으로 정의한다.

> **지식은 claim/evidence로 관리하고, 검색은 index/search가 담당하고, 주입은 router가 제어하고, 개인화는 Honcho식 representation layer가 담당하는 메모리 운영체제.**

프로젝트 이름 또는 내부 아키텍처 명칭으로는 다음을 사용할 수 있다.

```text
Claim-Grounded, Persona-Aware Memory Routing OS
```

또는

```text
Personalized Context-Routed Memory OS
```

---

## 17. 최종 요청

이제 현재 프로젝트를 위 원칙에 맞게 분석하고 개선하라.

단순히 추상 설계만 하지 말고, 다음 기준을 만족해야 한다.

```text
- 실제 파일 구조로 옮길 수 있어야 한다.
- Claude Code / OpenClaw / Hermes / PAI 계열의 장점을 반영해야 한다.
- Honcho 통합이 명확해야 한다.
- 중복/충돌/오래된 기억에 대한 대응이 있어야 한다.
- 라우터가 지식 목록으로 비대해지지 않도록 해야 한다.
- persona와 fact가 분리되어야 한다.
- search index는 재빌드 가능한 파생물이어야 한다.
- 모든 중요한 기억은 source/evidence와 연결되어야 한다.
```

작업 결과는 PRD, 아키텍처, 파일 트리, 구현 계획, 핵심 파일 초안까지 포함하여 제시하라.
