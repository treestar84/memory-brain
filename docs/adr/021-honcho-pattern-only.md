# ADR-021: Honcho self-host 결정 철회 — 모델 답습 only, 자체 PersonaStore 도입

**날짜**: 2026-04-27
**상태**: 채택됨
**관련 에픽**: plan v3 PR-V3.1 회수 + L6 Persona Layer 자체 구현
**연관**: ADR-019 §결정 §1 amend (Honcho 통째 self-host 결정 철회), ADR-018 §1, ADR-020

---

## 결정

ADR-019 §결정 §1 의 "Honcho server 통째 self-host" 결정을 **철회**한다. 비전 §2.1 "Honcho 반드시 사용"을 다음과 같이 재해석:

1. **Honcho server 코드 / `@honcho-ai/sdk` / docker-compose 자체호스팅 모두 폐기**.
2. **Honcho 의 모델·패턴만 답습**: peer / session / message / representation / derived conclusion 추상.
3. **자체 `PersonaStore` 도입**: `memory/profile/*.jsonl` 기반 가벼운 구현 (markdown + jsonl, 외부 server·DB·LLM key 의존 0).
4. **AGPL 격리 정책 N/A**: Honcho 코드 사용 안 하므로 ADR-019 §AGPL 격리 자연 소멸.

비전 §16 4축의 L6 Persona 는 **본 ADR로 자체 구현 결정**. ADR-019 §1 (L6 통째 도입)은 amended.

## 배경

PR-V3.1 (`3b50894` + `dbb6d62`) 머지 후 사용자가 self-host 가이드 (`docs/honcho-self-host.md`)를 검토하며 다음 발화:

> "이건 내가 원하는 것이 아니긴해 너무 무거워지는거야. 혼초의 형태는 최대한 흡수하지만 이건 내 방향성과 맞지 않으니 빼야 할것 같아"

부담 분석:
- Postgres + pgvector container — vector embedding 저장 강제
- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` — Honcho server가 외부 LLM 호출 의존
- `HONCHO_AUTH_KEY` — server 자체 인증
- docker idle 200MB+ — 사용자 1인 환경 부담

memory-brain의 핵심 정신은 **local-first markdown source-of-truth**(비전 §2.2 OpenClaw 답습). Honcho server는 별도 LLM-backed AI server라 이 정신과 충돌. 사용자 명시 발화로 결정 변경.

## 자체 PersonaStore 사양 (1차)

**저장 위치**:
- `memory/profile/peers.jsonl` — peer 메타 (append-only, last-wins by `peerId`)
- `memory/profile/sessions.jsonl` — session 메타 (append-only)
- `memory/profile/messages.jsonl` — 메시지 (append-only, `sessionId` 필드로 필터)
- `memory/profile/representations.jsonl` — representation 누적 (last-wins by `peerId`)
- `memory/profile/{peerId}.md` — projector 출력 (후속 PR, 본 PR 미포함)

**핵심 인터페이스** (Honcho 패턴 답습):
```ts
class PersonaStore {
  recordPeer(peerId: string, metadata?: Record<string, unknown>): Promise<void>;
  recordSession(sessionId: string, peerIds: string[]): Promise<void>;
  recordMessage(sessionId: string, peerId: string, content: string, metadata?: Record<string, unknown>): Promise<void>;
  getRepresentation(peerId: string): Promise<Representation | null>;
  setRepresentation(peerId: string, text: string, evidence: EvidencePointer[]): Promise<void>;
  listPeers(): Promise<Peer[]>;
}
```

**representation 생성 전략**:
- 1차: **수동 upsert** (사용자 또는 Claude 본체가 명시 호출). 자동 LLM 호출 없음.
- 후속 PR-V3.x: 의미 합성 자동화 (cfgm-process 패턴 답습 — Claude 본체가 의미 판단).
- 자동 LLM 호출 도입 시 별도 ADR.

**evidence pointer**:
- 비전 §3.3 답습 — representation 은 `inferred profile`이며 `evidence` 필드로 source 인용 의무.
- `EvidencePointer = { source: string; quote?: string }` (claim layer 패턴 답습)

## ADR-019 amend 영향

- ADR-019 §결정 §1 → "L6 Persona — Honcho 통째 도입" 철회. 자체 구현으로 대체.
- ADR-019 §결정 §2·§3 (OpenClaw 포맷 / Graphiti 모델 답습) **유지** — 코드 통째 incorporate 아닌 패턴 차용이라 부담 없음.
- ADR-019 §AGPL 격리 정책 — Honcho 코드 사용 안 하므로 N/A. ADR-020 라이선스 결정도 유지(향후 다른 의존성 평가 토대).

## PR 영향 (코드 회수)

**삭제**:
- `docker-compose.honcho.yml`
- `docs/honcho-self-host.md`
- `src/core/persona/HonchoBridge.ts`
- `tests/core/persona/HonchoBridge.test.ts`
- `package.json` `@honcho-ai/sdk` 의존성

**변경**:
- `src/core/persona/types.ts` — Honcho 인터페이스 → PersonaStore 도메인 타입 (Peer/Session/Message/Representation/EvidencePointer)
- `bun.lock` — SDK 제거 후 재생성

**신규**:
- `src/core/persona/PersonaStore.ts` — `memory/profile/*.jsonl` 기반 1차 구현
- `tests/core/persona/PersonaStore.test.ts` — 단위 테스트
- `src/hooks/bootstrap.ts` — `personaStore` deps 추가 (HonchoBridge 자리 대체)

## 거부 대안

### X1. PR-V3.1 git revert 후 처음부터
- 거부 사유: ADR-019/020 + 라이선스 결정은 유지 가치 있음. 부분 amend가 효율적.

### X2. Honcho SaaS 모드 사용 (자체호스팅 회피)
- 거부 사유: 사용자 데이터 외부 의존. memory-brain local-first 정신 위반. 비용·privacy 양측 충돌.

### X3. 자체 server 구축 (Postgres + pgvector + LLM 호출)
- 거부 사유: Honcho를 새로 만드는 것과 동일한 부담. local-first 정신 위반.

### X4. Mem0 / Letta 로 대체
- 거부 사유: ADR-019 §거부 후보 답습 — Mem0 passive extraction · Letta agent runtime 충돌.

## 진입 게이트 (ADR-018 §1)

- AND 항 1 (객관 데이터): 사용자 self-host 가이드 검토 후 명시 거부 발화 — 객관 항목.
- AND 항 2 (사용 사례): "혼초의 형태는 흡수하지만 server는 빼라" — S3(작업 학습 패턴) + L6 자체 구현 첫 점화점.
- §3 우회 채널 사용 안 함.

## 후속 영향

- PR-V3.2 (memory/ 트리 + bootloader, 비전 §14.1) → `memory/profile/` 추가 (peers/sessions/messages/representations 4 jsonl).
- PR-V3.3 (ROUTER) → persona lane 진입 시 `PersonaStore.getRepresentation` 호출 (HonchoBridge 자리).
- PR-V3.8 (PAI 9-file × Persona 통합) → 9-file의 `user.md` / `voice.md` 가 `PersonaStore` representation의 view 역할 정렬.

## 참고

- ADR-019 (`docs/adr/019-oss-incorporation.md`) — 본 ADR이 §결정 §1 amend
- ADR-020 (`docs/adr/020-license-policy.md`) — 라이선스 결정 유지
- ADR-018 (`docs/adr/018-phase-entry-gate-meta.md`) §1 인용
- ADR-009 (`docs/adr/009-identity-promotion-sidecar.md`) — sidecar 패턴 답습 원본
- 비전 §2.1 §2.2 §3.3 §6 §7 — Honcho 모델 답습 근거
- 사용자 발화 (2026-04-27): "혼초의 형태는 흡수하지만 server는 빼라"
- PR-V3.1 (`3b50894` + `dbb6d62`) — 본 ADR로 회수
