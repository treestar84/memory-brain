---
id: decision.ssl-kg-brain
type: decision
status: active
confidence: high
tags: [ssl, kg-brain, ontology, normalizer, pr-v3.12]
related: [concept.ssl-skill-representation, decision.oss-incorporation]
updated_at: 2026-05-05
---

# Decision — SSL을 KG-Brain 본체 schema로 채택

## Summary

<!-- claim:cl-dec-ssl-001 -->
arXiv 2604.24026의 SSL(Scheduling–Structural–Logical) 표현을 memory-brain KG-Brain의 본체 schema로 채택한다. SKILL.md는 surface(source-of-truth)로 유지, KG는 derived/rebuildable로 둔다.

## Decisions

<!-- claim:cl-dec-ssl-002 -->
**닫힌 어휘는 논문 Appendix A.3/A.4를 그대로 import한다.** 가지치기는 실제 사용 패턴이 누적된 뒤(PR-V3.14+) 결정한다. 1차에서 임의 단순화 금지.

<!-- claim:cl-dec-ssl-003 -->
**SSL schema는 `src/core/ontology/ssl.ts`에 둔다.** 별도 `src/core/kg/` 모듈을 새로 만들지 않는다 — 기존 `ontology/types.ts`와 한 디렉토리 안에서 schema가 응집되도록.

<!-- claim:cl-dec-ssl-004 -->
**SKILL.md = source-of-truth, SSL JSON = derived.** rebuild는 source SHA-256 비교로 stale 감지. KG가 source-of-truth가 되는 역전은 LLM normalizer 신뢰가 임계 이상 검증된 후(PR-V3.15+)에야 재논의.

<!-- claim:cl-dec-ssl-005 -->
**PR-V3.12 = heuristic normalizer + closed vocabulary 1차.** LLM normalizer (paper §3.3 NL2JSON), retrieval index (§4.1), risk classifier (§4.2)는 후속 PR로 분리. 각 layer를 독립 검증 가능하게.

## Rationale

<!-- claim:cl-dec-ssl-006 -->
사용자의 "skill을 활용하는 것과 같은 효과를 KG가 낸다" 직관이 논문의 SSL discovery MRR 0.573→0.707, risk F1 0.744→0.787 향상으로 이미 입증되어 있다. 약어 해석(self-supervised vs scheduling-structural-logical)만 다를 뿐 방향이 일치한다.

<!-- claim:cl-dec-ssl-007 -->
기존 자산(`src/core/ontology/`, `src/core/normalizer/`, `src/core/claim/`)이 SSL 3-layer를 거의 그대로 수용하므로 신규 코드 면적이 작다. OSS 통째 도입 선호와 결이 맞는다.

## Evidence

- `arXiv:2604.24026v1` — SSL representation, normalizer, downstream apps (§3, §4, Table 1, Table 3)
- `src/core/ontology/ssl.ts:1-134` — schema 구현
- `src/core/normalizer/SkillNormalizer.ts:1-180` — heuristic 변환기
- `tests/core/normalizer/skill-normalizer.test.ts` — schema/transition/validation 테스트
- 사용자 발화 (2026-05-05, /team kickoff): "근본적인 개념이해에 대한 것은 논문의 내용대로 ssl 형태, 이건 kg로 구성해낼것이고 이걸로 kg 브레인의 본체를 만들어줘"
- 사용자 결정 (2026-05-05): "1. ok, 그외 결정은 권장 안으로 진행해줘" — 권장안 5종 채택 승인

## Related

- [[concept.ssl-skill-representation]] — SSL 개념 정의
- [[decision.oss-incorporation]] — OSS/외부연구 통째 도입 정책
