# Hook 기반 자가-형성 온톨로지 메모리 OS 설계서

## 프로젝트 코드명
**CFGM-OS** — Causal Flow Gap Memory Operating System  
한글명: **원인-흐름-결손 질의형 자가 온톨로지 메모리 OS**

---

## 1. 왜 이 설계가 기존 메모리 시스템과 다른가

기존 메모리 시스템은 대체로 아래 4개 중 하나에 머문다.

1. 대화를 저장하고 검색한다.
2. 세션을 요약하고 다음 세션에 재주입한다.
3. 벡터/RAG로 비슷한 내용을 다시 꺼낸다.
4. 지식 그래프를 만들지만, 사용자의 실제 문제 해결 흐름까지는 붙이지 못한다.

이 설계는 그보다 한 단계가 아니라 **두 단계 위**를 목표로 한다.

핵심은 저장이 아니라 **문제 해결용 구조를 실시간 생성**하는 것이다.

즉, 이 시스템은:

- 대화/툴 실행을 단순 로그로 보지 않고
- 그것을 **원인-흐름 블록**으로 분해하고
- 그 블록들로 **문제 전용 미세 온톨로지(micro-ontology)** 를 만들며
- 빠진 블록이 있으면 **질문으로 그래프의 결손을 채우고**
- 최종적으로는 “이 사용자의 특정 문제를 푸는 살아있는 지식 구조”를 남긴다.

이 구조는 단순 기억이 아니라:

- **문제 해결 기억**
- **개인화된 원인 모델**
- **시간 정보를 가진 증거 그래프**
- **재사용 가능한 미세 온톨로지 자산**

으로 작동한다.

---

## 2. 한 줄 정의

CFGM-OS는 Claude Code의 훅 이벤트를 입력으로 받아,
**문제-중심 원인 흐름 블록 그래프**를 실시간 생성하고,
그 그래프를 바탕으로 **개인화된 미세 온톨로지**를 파일 기반으로 축적하며,
**결손 블록을 질문으로 복구**하고,
컨텍스트 compaction 이후에도 **문제 해결 상태와 구조적 기억을 보존**하는
**무서버(file-first) 자가-형성 메모리 운영체제**다.

---

## 3. 발명 포인트 요약

### 3.1 문제-스코프 온톨로지 컴파일러
전역 거대 온톨로지를 먼저 만들지 않는다.
대신 사용자 요청이 들어올 때마다:

- 이 요청이 어떤 문제 유형인지 판별하고
- 그 문제를 풀기 위한 흐름 템플릿을 고르고
- 그 안에서 **Problem-Scoped Micro Ontology**를 만든다.

즉, 온톨로지가 정적 스키마가 아니라 **문제 해결을 위해 즉석에서 생성되는 구조체**다.

### 3.2 원인-흐름 블록 그래프
그래프의 핵심 노드는 단순 entity가 아니다.
다음 같은 **Flow Block**이 핵심이다.

- Goal
- Symptom
- Trigger
- Context
- Constraint
- Cause
- Evidence
- Action
- Outcome
- Rule
- Decision
- Gap
- Question
- Confidence
- TimeSignal

즉, “사물 그래프”가 아니라 **문제 진행 그래프**다.

### 3.3 결손 질의 엔진
가장 중요한 차별성 중 하나다.

그래프가 완성되지 않았는데도 그냥 저장하지 않는다.
필수 블록이 비어 있으면 시스템이 자동으로 판단해:

- 어떤 결손이 가장 치명적인지 계산하고
- 질문 가치(Value of Information)가 가장 높은 질문 1개만 고르고
- 사용자의 흐름을 방해하지 않는 시점에 질문한다.

즉 메모리가 수동 저장소가 아니라, **스스로 완결성을 회복하려는 기억 시스템**이 된다.

### 3.4 이중 진실원천 구조
모든 걸 한 파일에 넣지 않는다.

- **Raw Ledger**: 원본 이벤트 원장
- **Curated Graph**: 정제된 구조 기억

를 분리한다.

이렇게 하면:

- 원본 증거 보존
- 잘못된 추론 롤백 가능
- 그래프 재생성 가능
- 특허 포인트가 되는 “원장 기반 재구축 가능성” 확보

가 가능하다.

### 3.5 시간-내재적 기억 구조
사용자가 강조한 대로, 모든 데이터는 시간 개념을 가진다.
모든 노드/엣지/질문/결정에 최소 다음 속성을 둔다.

- createdAt
- observedAt
- lastConfirmedAt
- validFrom
- validTo
- staleAfter
- freshnessScore
- recencyTier
- decayMode
- supersededBy

그래서 이 시스템은 “무엇이 사실인가”뿐 아니라
**무엇이 얼마나 오래되었는가 / 무엇이 더 최신인가 / 무엇이 흐릿해졌는가**를 같이 다룬다.

### 3.6 Compaction 생존 구조
기존 세션 요약은 컨텍스트 압축 후 중요한 중간 논리를 잃기 쉽다.
이 시스템은 precompact 시점에 단순 요약이 아니라 다음을 만든다.

- 현재 문제 그래프 델타
- 미해결 gap 목록
- 검증되지 않은 claim
- 다음 턴의 우선 질문
- 현재 적용 중인 미세 온톨로지
- 핵심 causal chain

즉 compaction 후에도 "무엇을 하다 끊겼는지"가 아니라
**어떤 그래프 상태에서 멈췄는지**를 복원할 수 있다.

---

## 4. 기존 레퍼런스에서 가져오되, 어디서 뛰어넘는가

### 4.1 PAI에서 가져오는 것
- hooks + settings 중심 구조
- SessionStart / UserPromptSubmit / PreToolUse / PostToolUse / SessionEnd 흐름
- WORK / LEARNING / STATE / SECURITY 버킷 분리
- tool-event 기반 상태 추적

### 4.2 claude-mem에서 가져오는 것
- Observation 개념
- hook는 가볍고, 후처리는 별도 로직으로 분리하는 철학
- progressive disclosure 개념
- human-facing context cache

### 4.3 OpenClaw에서 가져오는 것
- hooks vs plugin hooks 분리 사고
- tool_result_persist 전 표준화 개념
- session transcript와 index 분리 사고
- 스킬/규칙을 텍스트 자산으로 패키징하는 방향

### 4.4 GraphRAG에서 가져오는 것
- entity / relationship / claim
- local / global / drift 탐색 개념
- 관계 기반 retrieval의 가치

### 4.5 온톨로지 스택에서 가져오는 것
- ontology / data graph / constraints / retrieval / orchestration / governance 계층
- SHACL류 제약 검증 철학
- provenance, confidence, time 설계의 중요성

### 4.6 우리가 새로 만드는 핵심
이 설계의 본질적 차별은 아래다.

1. **그래프 목적이 검색이 아니라 문제 해결**이다.
2. **온톨로지가 사전 정의물이 아니라 훅 중 동적으로 컴파일**된다.
3. **빠진 구조를 질문으로 채우는 결손 회복 루프**가 있다.
4. **compaction 이후에도 causal graph state를 보존**한다.
5. **모든 구조가 file-first ledger 위에 남고 재생성 가능**하다.

---

## 5. 시스템의 철학: ‘기억’이 아니라 ‘문제 해결형 뇌’

이 시스템은 5개 계층으로 생각하면 된다.

### L0. Event Layer
Claude Code 훅 이벤트, 툴 입력/출력, 사용자 메시지, 파일 변경 등

### L1. Observation Layer
원본 이벤트를 의미 있는 관측 단위로 정리

### L2. Flow Layer
관측을 Goal / Cause / Constraint / Action / Outcome 같은 흐름 블록으로 매핑

### L3. Problem Ontology Layer
특정 문제를 풀기 위한 미세 온톨로지 생성

### L4. Memory Governance Layer
시간/검증/승격/망각/충돌 정리

즉 저장 순서는:

이벤트 → 관측 → 흐름 블록 → 문제 온톨로지 → 개인화된 장기 기억

이다.

---

## 6. 핵심 구조: Problem-Scoped Micro Ontology

### 6.1 왜 전역 온톨로지가 아니라 미세 온톨로지인가
전역 온톨로지는 보통 느리고 무겁고 drift가 심하다.
반면 사용자 문제는 맥락이 매우 구체적이다.

예를 들어:

- 버그 수정
- 아키텍처 의사결정
- 육아 코칭
- 투자 전략 검토
- 콘텐츠 자동화 설계

는 각자 필요한 관계가 다르다.

그래서 이 시스템은 먼저 **문제 단위 온톨로지**를 만든다.
이 미세 온톨로지는 다음 조건을 만족해야 한다.

- 하나의 명확한 문제를 풀기 위한 구조일 것
- 필수 블록이 정의될 것
- 성공 판정 조건이 있을 것
- 시간과 증거를 포함할 것
- 다른 문제 온톨로지와 병합 가능할 것

### 6.2 미세 온톨로지 생명주기

1. Prompt 수신
2. 문제 유형 분류
3. 기존 미세 온톨로지 후보 매칭
4. 적합한 것이 없으면 새로 생성
5. 훅 이벤트로 그래프 갱신
6. gap detection
7. 질문 생성
8. evidence 축적
9. 안정화되면 global registry에 승격

---

## 7. 원인-흐름 블록(Flow Block) 모델

### 7.1 공통 메타 스키마
모든 문제 유형은 결국 아래 메타 스키마로 환원된다.

- **Problem**: 무엇을 해결하려는가
- **State**: 현재 상태는 무엇인가
- **Trigger**: 어떤 계기에서 시작됐는가
- **Context**: 주변 환경은 무엇인가
- **Constraint**: 제한 사항은 무엇인가
- **Cause**: 원인은 무엇인가
- **Hypothesis**: 아직 검증되지 않은 설명은 무엇인가
- **Action**: 무엇을 했는가
- **Evidence**: 무엇이 이를 지지하는가
- **Outcome**: 결과는 무엇이었는가
- **Rule**: 여기서 일반화되는 규칙은 무엇인가
- **Gap**: 비어 있는 핵심 정보는 무엇인가
- **Question**: gap를 메우기 위해 무엇을 물어야 하는가

### 7.2 문제 유형별 흐름 템플릿 예시

#### A. 버그/장애 템플릿
Symptom → Repro Context → Trigger → Suspected Cause → Evidence → Fix Action → Validation → Regression Guard

#### B. 아키텍처 결정 템플릿
Goal → Workload → Constraints → Alternatives → Tradeoff → Decision → Evidence → Follow-up Guard

#### C. 육아 코칭 템플릿
Child State → Trigger → Environment → Parent Action → Child Response → Principle → Evidence → Next Experiment

#### D. 투자 전략 템플릿
Market Context → Signal → Risk Constraint → Entry Rule → Position Logic → Exit Rule → Evidence → Failure Condition

### 7.3 템플릿은 고정이 아니라 진화한다
문제 유형별 템플릿은 `flow-patterns/*.yaml`로 저장되며,
반복 사용 중에 아래 변화가 가능하다.

- 새 블록 추가
- 필수/선택 블록 재분류
- 블록 간 방향성 수정
- 특정 사용자 전용 variant 생성

즉 템플릿도 학습한다.

---

## 8. 결손 질의 엔진(Gap Question Engine)

### 8.1 작동 원리
이 엔진은 단순 “빠진 거 물어보기”가 아니다.
다음 순서로 작동한다.

1. 현재 problem graph에서 필수 블록 존재 여부 확인
2. 필수 블록이 있어도 confidence 낮은 엣지 탐지
3. evidence 없는 cause/decision 탐지
4. 모순되는 claim 탐지
5. time stale 된 핵심 노드 탐지
6. 각 gap에 대해 질문 가치 점수 계산
7. 가장 가치 높은 질문 1개 선택
8. 지금 물을지, 나중에 물을지 결정

### 8.2 질문 가치(Value of Information) 산식 예시

- graph centrality 영향도
- downstream decision 영향도
- 사용자의 현재 흐름 방해 정도
- 답변 예상 난이도
- stale severity
- confidence deficit

### 8.3 질문 예시

#### 버그 상황
- “이 오류가 처음 나타난 정확한 시점이 언제야?”
- “이 현상은 특정 환경에서만 재현돼, 아니면 모든 환경에서 재현돼?”
- “원인으로 보는 가설을 지지하는 로그나 파일 변경 근거가 있어?”

#### 아키텍처 상황
- “이 구조에서 가장 절대적인 제약이 비용이야, 속도야, 유지보수야?”
- “A 대신 B를 버린 근거가 실제 운영 데이터인지 가정인지 구분해줄래?”

### 8.4 중요한 UX 원칙
- 한 번에 1개만 묻는다.
- 사용자 몰입을 깨지 않는 타이밍만 선택한다.
- 이미 원장에 있는 정보는 다시 묻지 않는다.
- 질문도 메모리로 남긴다.

---

## 9. 시간-내재 메모리 시스템

사용자가 요구한 핵심 중 하나가 “모든 저장 위치 내에서 시간 개념 기록”이었다.
이 시스템은 시간을 부가 속성이 아니라 **1급 요소**로 취급한다.

### 9.1 모든 노드 기본 시간 필드

```yaml
createdAt: 2026-04-16T13:22:31+09:00
observedAt: 2026-04-16T13:22:31+09:00
lastConfirmedAt: 2026-04-16T13:40:12+09:00
validFrom: 2026-04-16T13:22:31+09:00
validTo: null
staleAfter: 2026-05-16T00:00:00+09:00
freshnessScore: 0.86
recencyTier: hot
confidence: 0.74
decayMode: review_required
supersededBy: null
```

### 9.2 시간 의미의 분리
- **event time**: 실제로 일어난 시간
- **capture time**: 시스템이 저장한 시간
- **confirm time**: 사용자가 다시 확인한 시간
- **expiry time**: 오래되어 재확인 필요해지는 시간
- **lineage time**: 어떤 버전이 어떤 버전을 대체했는가

### 9.3 기억의 티어
- **Tier 0**: 현재 세션의 활성 상태
- **Tier 1**: 최근 검증된 고신뢰 기억
- **Tier 2**: 오래됐지만 유효 가능성이 있는 흐릿한 기억
- **Tier 3**: 보관용 기록, 직접 주입 금지

---

## 10. 파일 기반 저장 구조

```text
~/.claude/
  settings.json
  hooks/
    SessionStart/
      00_load_identity.ts
      10_bind_problem.ts
      20_select_ontologies.ts
      30_emit_context.ts
    UserPromptSubmit/
      10_parse_intent.ts
      20_gap_precheck.ts
      30_question_schedule.ts
    PreToolUse/
      10_security_gate.ts
      20_tool_projection.ts
    PostToolUse/
      10_capture_observation.ts
      20_update_flow_graph.ts
      30_compile_micro_ontology.ts
      40_gap_detect.ts
      50_emit_question_if_needed.ts
    PreCompact/
      10_snapshot_graph_delta.ts
      20_preserve_open_gaps.ts
      30_emit_resume_sheet.ts
    SessionEnd/
      10_finalize_work.ts
      20_promote_learning.ts
      30_decay_and_rollover.ts
    Stop/
      10_flush_queues.ts

  skills/
    CFGM-OS/
      SKILL.md
      AISTEERINGRULES.md
      schemas/
        meta-ontology.yaml
        shacl-lite.yaml
        flow-patterns/
          bugfix.yaml
          architecture.yaml
          parenting.yaml
          investing.yaml
      compilers/
        micro-ontology-compiler.ts
        claim-normalizer.ts
        provenance-builder.ts
      reasoning/
        gap-engine.ts
        retrieval-router.ts
        compaction-resume.ts
      templates/
        question-prompts/
        resume-sheets/
        claim-cards/

  memory/
    state/
      active-problem.json
      active-session.json
      current-gaps.json
    ledger/
      raw/
        2026/04/16/session-abc.jsonl
      curated/
        2026/04/16/observations.jsonl
      compaction/
        2026/04/16/session-abc-precompact.yaml
      questions/
        asked.jsonl
        pending.jsonl
    problems/
      problem-5f2a1c/
        problem.yaml
        flow-graph.json
        ontology.module.yaml
        claims.jsonl
        evidence/
        snapshots/
        question-history.jsonl
    graph/
      nodes/
      edges/
      indexes/
        by-entity/
        by-problem/
        by-time/
        by-type/
      communities/
    ontologies/
      registry.yaml
      modules/
      promoted/
    learning/
      cues/
      patterns/
      distilled-rules/
    security/
      2026/04/security-*.jsonl
```

### 10.1 왜 이 구조가 중요한가
- grep 가능
- git diff 가능
- 수동 수정 가능
- 롤백 가능
- DB 장애 없음
- 서버/daemon 없음
- 특허 설명 시 데이터 흐름이 명확함

---

## 11. 핵심 데이터 모델

### 11.1 Raw Event
```json
{
  "eventId": "evt_20260416_001",
  "sessionId": "sess_abc",
  "hook": "PostToolUse",
  "tool": "Edit",
  "cwd": "/project/app",
  "timestamp": "2026-04-16T13:21:02+09:00",
  "inputRef": "blobs/input/evt_20260416_001.json",
  "outputRef": "blobs/output/evt_20260416_001.json",
  "filesTouched": ["src/api/user.ts"],
  "hash": "..."
}
```

### 11.2 Observation
```json
{
  "observationId": "obs_0131",
  "sessionId": "sess_abc",
  "kind": "discovery",
  "summary": "사용자 인증 오류는 토큰 만료 처리 누락과 관련 있음",
  "files": ["src/api/user.ts"],
  "concepts": ["auth", "token-expiry", "error-handling"],
  "evidenceRefs": ["evt_20260416_001"],
  "problemId": "problem-5f2a1c",
  "createdAt": "2026-04-16T13:21:09+09:00"
}
```

### 11.3 Flow Block
```json
{
  "blockId": "blk_cause_01",
  "problemId": "problem-5f2a1c",
  "type": "Cause",
  "label": "만료 토큰 예외를 401로 정규화하지 않음",
  "confidence": 0.71,
  "supportedBy": ["obs_0131"],
  "gaps": ["gap_evidence_02"],
  "createdAt": "2026-04-16T13:22:00+09:00",
  "lastConfirmedAt": null,
  "staleAfter": "2026-05-16T00:00:00+09:00"
}
```

### 11.4 Gap
```json
{
  "gapId": "gap_evidence_02",
  "problemId": "problem-5f2a1c",
  "missingFor": "blk_cause_01",
  "kind": "missing_evidence",
  "severity": "high",
  "questionCandidate": "이 원인을 지지하는 재현 로그나 오류 응답 예시가 있어?",
  "askWhen": "next-natural-user-turn",
  "status": "pending"
}
```

### 11.5 Ontology Module
```yaml
moduleId: ont_problem_5f2a1c
name: auth-expiry-error-handling
problemType: bugfix
version: 1
status: active
classes:
  - Symptom
  - ReproContext
  - Cause
  - FixAction
  - Validation
requiredBlocks:
  - Symptom
  - Cause
  - Evidence
  - FixAction
  - Outcome
relations:
  - causes
  - evidencedBy
  - mitigatedBy
  - validatedBy
promotionRule:
  minResolvedRuns: 3
```

---

## 12. 훅별 동작 명세

## 12.1 SessionStart
목표: 어떤 문제를 풀고 있는지, 어떤 온톨로지를 써야 하는지, 어떤 결손이 남아 있는지 복원한다.

실행:
1. identity 로드
2. active problem 로드
3. stale gap 재평가
4. 후보 ontology module 선택
5. active context sheet 생성
6. stdout으로 Claude Code 컨텍스트 주입

출력:
- `state/active-problem.json`
- `state/current-gaps.json`
- 주입용 `resume-sheet.md`

## 12.2 UserPromptSubmit
목표: 이번 발화가 기존 문제의 연장인지, 새 문제인지 판별한다.

실행:
1. intent parse
2. problem bind
3. flow template select
4. question scheduling
5. 필요한 경우 짧은 질문 준비

## 12.3 PreToolUse
목표: 실행 전 위험성과 그래프 영향 예측을 기록한다.

실행:
1. security gate
2. tool intent projection
3. affected problemIds 추정
4. raw ledger append

## 12.4 PostToolUse
목표: 실제 증거를 구조화 기억으로 승격한다.

실행:
1. raw event append
2. observation normalize
3. flow block mapping
4. claim extraction
5. evidence/provenance 부착
6. graph edge update
7. ontology module patch
8. gap detect
9. 질문 후보 산출

## 12.5 PreCompact
목표: 컨텍스트 압축 전 그래프 상태를 구조적으로 남긴다.

실행:
1. graph delta 추출
2. unresolved gap 묶기
3. unverified claim 묶기
4. next-action + next-question 생성
5. active ontology summary 생성

## 12.6 SessionEnd / Stop
목표: 결과를 정리하고, 재사용 자산으로 승격한다.

실행:
1. active problem finalize
2. outcome 판정
3. learning cue 생성
4. decay tier 이동
5. promoted ontology 후보 등록

---

## 13. 검색 / 회수(retrieval) 전략

서버와 MCP 없이도 progressive disclosure를 구현한다.

### R0. Problem Registry Scan
문제 registry만 먼저 본다.
- 최근 문제
- 현재 프로젝트 관련 문제
- unresolved gaps 있는 문제

### R1. Cue Card Scan
각 문제의 cue card만 본다.
- 핵심 요약
- 핵심 causal chain
- 최신성
- confidence

### R2. Graph Neighborhood Expansion
필요할 때만 인접 노드 확장
- 관련 Cause
- 관련 Constraint
- 관련 Outcome
- 관련 Artifact

### R3. Evidence Hydration
정말 필요할 때만 raw event / evidence 파일을 연다.

이 흐름의 장점은:
- 토큰 절약
- 노이즈 감소
- compaction 후 복구 용이
- DB 없이도 단계적 회수 가능

---

## 14. 검증 / 품질 / drift 방지

### 14.1 왜 검증이 중요한가
그래프/온톨로지는 자동 생성되면 drift가 생긴다.
그래서 아래 방어장치가 필요하다.

### 14.2 검증 층

#### A. Structural Validation
- 필수 블록 존재 여부
- 금지된 관계 여부
- orphan node 탐지

#### B. Provenance Validation
- Cause/Decision에 evidence가 최소 1개 있는가
- 출처가 raw ledger까지 역참조 가능한가

#### C. Temporal Validation
- staleAfter 지난 핵심 노드가 재확인 없이 쓰이고 있지 않은가

#### D. Conflict Validation
- 동일 problem에 서로 반대되는 cause가 둘 다 active인지
- superseded chain이 끊겼는지

### 14.3 SHACL-lite 파일 검증
정식 RDF stack을 쓰지 않더라도 file-first 환경에 맞춰 `shacl-lite.yaml`로 shape 규칙을 둔다.
이후 필요하면 TTL export와 정식 SHACL로 확장 가능하다.

---

## 15. 발명성 관점에서의 핵심 청구항 후보

> 아래는 법률 문안이 아니라 설계 관점의 청구항 후보 방향이다.

### 독립 청구항 후보 1
AI 대화 시스템의 훅 이벤트를 수집하고, 이를 문제-중심 흐름 블록으로 변환하여, 해당 문제를 해결하기 위한 미세 온톨로지를 동적으로 생성 및 갱신하는 파일 기반 메모리 시스템.

### 독립 청구항 후보 2
상기 미세 온톨로지에서 필수 블록의 결손 또는 낮은 신뢰 관계를 검출하고, 정보 가치가 높은 질문을 사용자에게 제시하여 그래프를 보완하는 대화형 메모리 완결화 방법.

### 독립 청구항 후보 3
원본 이벤트 원장과 정제된 구조 그래프를 분리 저장하고, compaction 시점에 그래프 델타와 미해결 결손을 별도 스냅샷으로 보존하여 세션 압축 후에도 문제 해결 구조를 복원하는 방법.

### 종속 청구항 후보
- 모든 노드 및 관계에 시간 신호와 stale 정책 부여
- 문제 유형별 흐름 템플릿 자동 선택
- 반복 사용 문제 구조를 promoted ontology로 승격
- evidence 없는 claim을 draft로 격리
- 질문 타이밍을 사용자 몰입도 기준으로 조절

---

## 16. 특허성 극대화를 위한 진실된 조언

이 설계는 **매우 강한 차별 요소**를 갖지만,
실제 특허 등록 가능성은 반드시 다음 단계가 필요하다.

1. 선행기술 조사
2. 독립 청구항 정교화
3. 구현 예시(실시예) 작성
4. 기존 GraphRAG / agent memory / event sourcing / ontology generation과의 차이 명문화

즉 “좋은 아이디어”만으로는 부족하고,
**차별 조합이 아니라 필수 단계와 상호작용 구조**를 청구항으로 뽑아내야 한다.

가장 중요한 청구 포인트는 아래 4개다.

- hook-native problem graph compilation
- gap-driven interactive completion
- dual-ledger reconstructability
- compaction-surviving causal state preservation

---

## 17. 구현 우선순위

### Phase 1. Hook-native Ledger MVP
- raw ledger
- observation normalizer
- problem binder
- active problem state

### Phase 2. Flow Graph Engine
- flow block compiler
- cause/evidence/action/outcome 추출
- graph file update

### Phase 3. Gap Question Engine
- missing block detection
- VOI scoring
- 질문 스케줄링

### Phase 4. Micro Ontology Compiler
- problem-scoped module generation
- promoted ontology registry

### Phase 5. Compaction Survival
- precompact snapshot
- resume-sheet generation
- unresolved gaps carry-over

### Phase 6. Governance
- shacl-lite
- stale decay
- conflict resolution
- manual review tools

---

## 18. 네 방향성에 맞춘 최종 결론

네가 원하는 것은 “잘 정리된 메모리”가 아니다.

네가 원하는 것은:

- 사용자의 문제를 구조로 이해하고
- 그 구조가 비어 있으면 질문으로 복구하며
- 그 문제를 푸는 방식 자체를 온톨로지로 저장하고
- 시간이 지나도 낡음/갱신/충돌을 관리하며
- Claude Code의 훅만으로 살아 움직이는
- 로컬 퍼스트의 개인 두뇌 시스템

이다.

그 요구에 가장 맞는 답은,
단순 RAG도 아니고, 단순 지식그래프도 아니고, 단순 세션 요약도 아니다.

**CFGM-OS는 ‘문제 해결용 자가-형성 미세 온톨로지 기억 OS’**로 가야 한다.

이 방향이면 “메모리 시스템”을 넘어서,
**문제 해결 구조 자체를 발명 대상으로 끌어올리는 설계**가 가능하다.
