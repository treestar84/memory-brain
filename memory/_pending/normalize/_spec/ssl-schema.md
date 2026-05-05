# SSL 0.3.0 Schema 명세

> arXiv 2604.24026 SSL (Scheduling–Structural–Logical) 표현. memory-brain KG-Brain 본체 schema. 본 명세는 **기계가 읽는 contract** 이다 — 변경은 SSL_VERSION bump 와 함께만 허용.

## 최상위 (SSLDocument)

```jsonc
{
  "sslVersion": "0.3.0",                  // 고정값
  "sourceSkillPath": "<상대 경로>",        // 원본 SKILL.md 위치 (source-of-truth)
  "sourceSha256": "<64자 hex>",            // 원본 SHA-256, stale 감지용
  "generatedAt": "<ISO-8601>",
  "generatedBy": "heuristic" | "llm",     // host LLM 처리 결과는 "llm"
  "scheduling": SchedulingNode,
  "structural": StructuralNode[],
  "logical": LogicalNode[],
  // v0.3.0 신규 4 노드 — 모두 optional, 빈 배열 default (back-compat)
  "decisions": DecisionNode[],            // when/then 분기
  "interactions": InteractionNode[],      // 사용자 발화 템플릿
  "evidence": EvidenceNode[],             // input/output sample + success criteria
  "protocols": ProtocolNode[],            // 다른 skill 위임 규약
  "warnings": string[]                    // PAI 세션 처리 후엔 빈 배열이어야 함
}
```

## SchedulingNode (왜·언제 호출되는가)

```jsonc
{
  "id": "<slug>#scheduling",
  "skillName": "<frontmatter.name>",
  "skillGoal": "<active form 한 문장>",
  "intentSignature": "<intentSignatures[0]>",
  "intentSignatures": ["<phrasing 1>", "<phrasing 2>", ...],   // 1-5 개
  "triggerPatterns": ["<자연어 조건>", ...],
  "expectedInputs": ["<typed identifier>", ...],
  "expectedOutputs": ["<typed identifier>", ...],
  "dependencies": ["<service|sdk|library>", ...],
  "controlFlowFeatures": ControlFlowFeature[],   // closed enum, 아래 참조
  "ioContract": { "inputsRaw": "<원문 그대로>", "outputsRaw": "<원문 그대로>" },
  "preconditions": ["<자연어 조건>", ...]
}
```

## StructuralNode (어떻게 흐르는가)

```jsonc
{
  "id": "<slug>#scene:<Scene>:<n>",
  "scene": Scene,                         // closed enum, 아래 참조
  "sceneGoal": "<active form 한 문장>",
  "summary": "<원본 헤더 그대로>",
  "containsLogicalIds": ["<slug>#logical:<n>", ...],
  "transitionsTo": ["<structural id>", ...]
}
```

## LogicalNode (무엇을 하는가)

```jsonc
{
  "id": "<slug>#logical:<n>",
  "action": Action,                       // closed enum, 아래 참조
  "description": "<한 문장>",
  "resources": ResourceScope[],           // closed enum
  "actionRef": "<canonical store ID>",    // optional, v0.3.0 — 있으면 의무 매치
  "resourceTarget": "<구체적 식별자>",     // optional but 강력 권고
  "effects": ["<post-condition past-tense>", ...],   // 의무
  "evidenceClaimIds": ["<cl-id>", ...]    // ClaimStore 참조 (없으면 빈 배열)
}
```

**actionRef 사용 규칙 (v0.3.0)**: `memory/concepts/_ssl/_canonical/actions.yaml` 의 ID 와 매치되면 inline action/resources 와 강제 일치 검증 (validateSSL 가 거부). 같은 패턴은 항상 같은 ref ID — 결정성 보장.

## v0.3.0 신규 4 노드

### DecisionNode (when/then 분기)

```jsonc
{
  "id": "<slug>#decision:<n>",
  "question": "<자연어 — 무엇을 판단하는가>",
  "branches": [{ "when": "<조건>", "then": "<행동 또는 노드 ID>" }],
  "fallback": "<선택>",
  "scopeRef": "<structural/logical id>"   // optional
}
```

### InteractionNode (사용자 발화 템플릿)

```jsonc
{
  "id": "<slug>#interaction:<n>",
  "prompt": "<자연어 템플릿 with {variables}>",
  "expectedResponseType": "free-text" | "yes-no" | "selection" | "structured" | "none",
  "variables": ["<var1>", ...],
  "options": ["A", "B"],                   // selection 시 의무
  "scopeRef": "<...>"
}
```

### EvidenceNode (input/output sample + success criteria)

```jsonc
{
  "id": "<slug>#evidence:<n>",
  "caseLabel": "<짧은 case 이름>",
  "inputs": { /* free-form */ },
  "outputs": { /* free-form */ },
  "successCriteria": ["<자연어 검증 조건>", ...],
  "scopeRef": "<...>"
}
```

### ProtocolNode (다른 skill 위임 규약)

```jsonc
{
  "id": "<slug>#protocol:<n>",
  "delegateTo": "<skill slug 또는 ref>",   // 의무
  "whenCondition": "<자연어>",
  "inputsForward": ["<id>", ...],
  "outputsExpected": ["<id>", ...],
  "scopeRef": "<...>"
}
```

## Closed Vocabulary (이외 값 금지)

### Scene (총 7)

`PREPARE`, `ACQUIRE`, `REASON`, `ACT`, `VERIFY`, `RECOVER`, `FINALIZE`

### Action (총 9)

`READ`, `WRITE`, `CALL_TOOL`, `INFER`, `EMIT`, `WAIT`, `BRANCH`, `SCHEDULE`, `TRANSFORM`

### ResourceScope (총 6)

`MEMORY`, `LOCAL_FS`, `CREDENTIALS`, `NETWORK`, `DATABASE`, `QUEUE`

### ControlFlowFeature (총 7)

`branching`, `loop`, `scheduled_retry`, `network_access`, `credential_access`, `long_running`, `stateful`

## 무결성 규칙 (validateSSL gate 가 강제)

1. `sslVersion` 은 정확히 `"0.3.0"`.
2. `structural[].scene` 은 Scene enum 안의 값.
3. `logical[].action` 은 Action enum 안의 값.
4. `logical[].resources[]` 의 모든 원소는 ResourceScope enum 안의 값.
5. `scheduling.controlFlowFeatures[]` 의 모든 원소는 ControlFlowFeature enum 안의 값.
6. `structural[].containsLogicalIds[]` 는 모두 실제 `logical[].id` 와 일치.
7. `structural[].transitionsTo[]` 는 모두 실제 `structural[].id` 와 일치.
8. `logical[].actionRef` 가 있으면 canonical store 에 존재하고 action/resources 가 매치 (store 미주입 시 graceful skip).
9. `interactions[].expectedResponseType` 은 closed enum.
10. `interactions[]` 가 `expectedResponseType="selection"` 이면 `options[]` 의무.
11. `decisions[].branches` 는 non-empty.
12. `protocols[].delegateTo` 는 non-empty string.
13. 4 신규 노드의 `scopeRef` 가 있으면 structural/logical id 와 일치 (dangling 거부).

## 참고

- Heuristic 구현: `src/core/normalizer/SkillNormalizer.ts`
- 검증 함수: `src/core/ontology/ssl.ts` `validateSSL()`
- 사용처: `src/core/search/SearchIndex.ts` `searchSkills()` (rich-field BM25), `src/core/governance/reports/SSLRiskDetector.ts` (risk gate)
