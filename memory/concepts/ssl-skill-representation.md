---
id: concept.ssl-skill-representation
type: concept
status: draft
confidence: medium
tags: [ssl, kg-brain, ontology, skill, normalizer]
related: [decision.ssl-kg-brain]
updated_at: 2026-05-05
---

# SSL Skill Representation — KG-Brain 본체 표현

## Summary

<!-- claim:cl-ssl-001 -->
SSL(Scheduling–Structural–Logical, arXiv 2604.24026, 2026)은 SKILL.md 자연어 문서를 닫힌 어휘 위 typed graph로 변환하는 3-layer 표현이다. memory-brain은 SSL을 KG-Brain의 본체 schema로 채택하여, SKILL.md는 surface로 두되 본체 호출은 KG가 담당하도록 설계한다.

## Key Concepts

<!-- claim:cl-ssl-002 -->
**Scheduling layer**는 skill 호출 표면(intent signature, trigger pattern, IO contract, precondition)을 담는다. "왜·언제 호출되는가"의 답.

<!-- claim:cl-ssl-003 -->
**Structural layer**는 skill 실행 phase graph로, 닫힌 Scene enum (`PREPARE / ACQUIRE / REASON / ACT / VERIFY / RECOVER / FINALIZE`)과 phase 간 transition으로 구성된다. "어떻게 흐르는가"의 답.

<!-- claim:cl-ssl-004 -->
**Logical layer**는 atomic action(`READ / WRITE / CALL_TOOL / INFER / EMIT / WAIT / BRANCH`)과 resource scope(`MEMORY / LOCAL_FS / CREDENTIALS / NETWORK`)로 표현된다. "무엇을 하는가"의 답.

<!-- claim:cl-ssl-005 -->
SKILL.md는 source-of-truth로 git에 유지하고, SSL JSON은 derived(rebuildable) artifact로 `memory/concepts/_ssl/<slug>.json` 에 저장한다. SHA-256으로 stale 감지.

<!-- claim:cl-ssl-006 -->
1차(PR-V3.12)는 heuristic normalizer만 제공한다. LLM 기반 source-grounded normalizer (paper §3.3) 는 PR-V3.13에서 layering. heuristic 누락은 `warnings[]` 로 노출되어 LLM normalizer가 메울 hole이 명시된다.

## Why this maps to memory-brain

<!-- claim:cl-ssl-007 -->
기존 자산이 SSL 3-layer를 거의 그대로 수용한다 — `src/core/ontology/`(schema), `src/core/normalizer/`(변환), `src/core/claim/`(Logical evidence ledger). 신규 작성 범위는 SSL closed vocabulary와 SkillNormalizer 한 쌍으로 좁혀진다.

## Evidence

- `arXiv:2604.24026v1` — SSL 3-layer 표현 + normalizer 파이프라인 (Figure 1, §3, Appendix A.3/A.4, Table 5)
- `src/core/ontology/ssl.ts` — closed vocabulary + validateSSL
- `src/core/normalizer/SkillNormalizer.ts` — heuristic 변환기 1차
- 사용자 발화 (2026-05-05): "skill md 보다 이 지식기반의 kg를 이용하면 스킬을 활용하는 것과 같은 효과를 내는 장치로 발전될거야"

## Related

- [[decision.ssl-kg-brain]] — 채택 결정
- [[memory-routing]] — L3/L4와의 위치 관계
