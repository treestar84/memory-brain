# SSL 0.2.0 Schema 명세

> arXiv 2604.24026 SSL (Scheduling–Structural–Logical) 표현. memory-brain KG-Brain 본체 schema. 본 명세는 **기계가 읽는 contract** 이다 — 변경은 SSL_VERSION bump 와 함께만 허용.

## 최상위 (SSLDocument)

```jsonc
{
  "sslVersion": "0.2.0",                  // 고정값
  "sourceSkillPath": "<상대 경로>",        // 원본 SKILL.md 위치 (source-of-truth)
  "sourceSha256": "<64자 hex>",            // 원본 SHA-256, stale 감지용
  "generatedAt": "<ISO-8601>",
  "generatedBy": "heuristic" | "llm",     // host LLM 처리 결과는 "llm"
  "scheduling": SchedulingNode,
  "structural": StructuralNode[],
  "logical": LogicalNode[],
  "warnings": string[]                    // host LLM 처리 후엔 빈 배열이어야 함
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
  "resourceTarget": "<구체적 식별자>",     // optional but 강력 권고
  "effects": ["<post-condition past-tense>", ...],   // 의무
  "evidenceClaimIds": ["<cl-id>", ...]    // ClaimStore 참조 (없으면 빈 배열)
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

1. `sslVersion` 은 정확히 `"0.2.0"`.
2. `structural[].scene` 은 Scene enum 안의 값.
3. `logical[].action` 은 Action enum 안의 값.
4. `logical[].resources[]` 의 모든 원소는 ResourceScope enum 안의 값.
5. `scheduling.controlFlowFeatures[]` 의 모든 원소는 ControlFlowFeature enum 안의 값.
6. `structural[].containsLogicalIds[]` 는 모두 실제 `logical[].id` 와 일치.
7. `structural[].transitionsTo[]` 는 모두 실제 `structural[].id` 와 일치.

## 참고

- Heuristic 구현: `src/core/normalizer/SkillNormalizer.ts`
- 검증 함수: `src/core/ontology/ssl.ts` `validateSSL()`
- 사용처: `src/core/search/SearchIndex.ts` `searchSkills()` (rich-field BM25), `src/core/governance/reports/SSLRiskDetector.ts` (risk gate)
