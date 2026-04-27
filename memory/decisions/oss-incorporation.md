---
id: decision.oss-incorporation
type: decision
status: active
confidence: high
tags: [oss, plan-v3, honcho, openclaw, graphiti, license]
related: [decision.license-policy, concept.memory-routing, project.memory-brain]
supersedes: []
updated_at: 2026-04-27
---

# OSS 통째 도입 정책

## Summary

<!-- claim:cl-oss-001 -->
memory-brain 의 비전 §16 4축 중 L4(Claim) / L3(Wiki) 는 OSS **모델 답습**으로, L6(Persona) 는 자체 구현으로 결정. Honcho server 통째 self-host 결정은 ADR-021 으로 철회.

## Key Decisions

<!-- claim:cl-oss-002 -->
**L3 Wiki**: OpenClaw (`openclaw/openclaw`, MIT, 2026-01) 의 skill / SOUL.md / memory-wiki 포맷을 코드 incorporate 없이 답습한다. 코드 통째 fork 는 신생 OSS 안정성 미검증으로 거부.

<!-- claim:cl-oss-003 -->
**L4 Claim**: Graphiti (`getzep/graphiti`, Apache-2.0) 의 `valid_from` / `valid_to` / `invalid_at` 3-필드 supersede 모델을 PR-V3.5 에서 자체 ClaimStore 에 incremental amend.

<!-- claim:cl-oss-004 -->
**L6 Persona**: Honcho self-host 부담(docker-compose + Postgres+pgvector + LLM API key) 이 사용자 local-first 정신과 충돌하여 철회. 자체 PersonaStore (markdown + jsonl, peers/sessions/messages/representations) 로 대체.

<!-- claim:cl-oss-005 -->
**거부 OSS 4건**: Mem0 (passive extraction, fact/inference 분리 부재) / Basic Memory (AGPL + Python only) / Letta (agent runtime 충돌) / Cognee (Python only).

<!-- claim:cl-oss-006 -->
**라이선스 정책 (ADR-020)**: memory-brain 본체는 MIT. AGPL 의존성은 별도 컨테이너 격리 + HTTP 호출만. GPL-3.0 / commercial 은 케이스별 ADR 의무.

## Evidence

- `docs/adr/019-oss-incorporation.md` — 도입 결정 + 거부 후보
- `docs/adr/020-license-policy.md` — MIT 명시
- `docs/adr/021-honcho-pattern-only.md` — Honcho self-host 철회
- `commit:5142099` — ADR-020 채택
- `commit:c96ae08` — ADR-019 채택
- `commit:3c7027e` — Honcho 회수 + 자체 PersonaStore
- `사용자 발화 (2026-04-27)`: "혼초의 형태는 흡수하지만 server 는 빼라 — 너무 무겁다, 내 방향성과 맞지 않는다"
- `사용자 발화 (2026-04-27)`: "OSS 통째 받아드려, 보수 방어 폐기"
- `.omc/wiki/vision-7-layer-arch.md` — OSS 매트릭스 조사 결과
- `memory_system_improvement_prompt.md` §2.1·§2.2·§16 — 비전 OSS 답습 정신

## Related

- [[decision.license-policy]] — MIT 명시 (ADR-020)
- [[concept.memory-routing]] — L2 Router 정책
- [[project.memory-brain]] — 본 프로젝트 진행도

## 운영 영향

- L3 Wiki 디렉토리 트리: `memory/{sources,projects,concepts,decisions}/` (PR-V3.4, 본 PR)
- L4 Claim 보강: PR-V3.5 (Graphiti supersede 모델)
- L6 Persona: PR-V3.1 PersonaStore 머지 후 ADR-021 로 자체 구현 확정
