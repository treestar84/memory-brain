# ADR-019: OSS 통째 도입 결정 — Honcho / OpenClaw / Graphiti

**날짜**: 2026-04-27
**상태**: 채택됨
**관련 에픽**: plan v3 PR-V3.0
**연관**: ADR-018 §1 (게이트 메타), ADR-020 (라이선스 MIT 선행), `.omc/wiki/vision-7-layer-arch.md`, `memory_system_improvement_prompt.md` §2.1·§2.2·§7·§16

---

## 결정

비전 §16 단일 OS 4축의 통째 OSS 도입을 다음과 같이 정한다.

1. **L6 Persona — Honcho 통째 도입** (`plastic-labs/honcho`, AGPL-3.0)
   - 자체호스팅 (docker-compose: Honcho server + Postgres + pgvector).
   - TypeScript SDK `@honcho-ai/sdk` v2.1.1 (**Apache-2.0** 확인 완료, AGPL 아님). MIT 본체와 호환.
   - **AGPL 격리 정책**: memory-brain 본체는 Honcho **server** 코드를 link/import 하지 않음. **HTTP API 호출만**. SDK는 Apache라 import 자유.
2. **L3 Wiki — OpenClaw 포맷 차용** (`openclaw/openclaw`, MIT)
   - 코드 통째 incorporate 아님 — **skill / SOUL.md / memory-wiki 포맷만 답습**.
   - 후속 PR-V3.4에서 `memory/{sources,projects,concepts,decisions}/` 디렉토리 트리에 OpenClaw 포맷 적용.
3. **L4 Claim — Graphiti 모델 차용** (`getzep/graphiti`, Apache-2.0)
   - 코드 통째 아님 — **`valid_from` / `valid_to` / `invalid_at` 3-필드 supersede 모델 답습**.
   - PR-A1.0 `ClaimStore` (`src/core/claim/`) 에 incremental amend (후속 PR-V3.5).

## AGPL 격리 정책 (Honcho 한정)

본체 라이선스 MIT(ADR-020)와 Honcho server AGPL-3.0의 호환을 위한 격리 의무:

- **격리 단위**: Honcho server는 별도 docker container로 실행. memory-brain 코드는 Honcho server 소스를 import/link 하지 않음.
- **호출 채널**: HTTP API만 (`@honcho-ai/sdk` 통해). SDK 자체는 Apache-2.0이라 import 자유.
- **소스 코드 공유 의무 부재**: AGPL은 "수정한 server를 네트워크로 제공"할 때 소스 공개 의무. memory-brain은 Honcho server를 **수정하지 않고 사용만** 하므로 의무 미발생.
- **기여 시 별도 ADR**: 향후 Honcho server 자체에 패치 기여하는 경우 AGPL 의무 발동 — 그 시점에 별도 ADR 작성.
- **사용자 자체호스팅 환경 제약 안내**: docker-compose 가이드 + Postgres+pgvector 의존성 명시(`docs/honcho-self-host.md`, PR-V3.1 산출).

## 통합 매트릭스

| 축 | OSS | License | 통합 형태 | 도입 PR |
|---|---|---|---|---|
| L6 Persona | Honcho server + `@honcho-ai/sdk` | AGPL-3.0 / Apache-2.0 | self-host + HTTP 호출 | **PR-V3.1** (본 사이클) |
| L3 Wiki | OpenClaw | MIT | 포맷 답습 | PR-V3.4 (후속) |
| L4 Claim | Graphiti | Apache-2.0 | 모델 답습 (`valid_from/valid_to/invalid_at`) | PR-V3.5 (후속) |

## 거부 후보

| 거부 OSS | 사유 |
|---|---|
| **Mem0** (`mem0ai/mem0`) | passive extraction 모델. 비전 §3.3 "explicit fact / inferred profile / canonical knowledge 분리" 정신 위반. claim/evidence 모델 부재. |
| **Basic Memory** (`basicmachines-co/basic-memory`) | AGPL + Python only + claim 추적 부재. Bun 정책 위반. |
| **Letta** (`letta-ai/letta`) | agent runtime 자체를 가져옴. memory-brain은 Claude Code 위 layer라 충돌. Python 99.5%, TS는 클라이언트만. |
| **Cognee** (`topoteretes/cognee`) | Python only. Bun 정책 위반. |
| **MemGPT (Letta 전신)** | 현재는 Letta로 통합, 별개 도입 가치 없음. |
| **AutoGen memory** | agent framework 내장. memory-brain 독립 layer 정책과 충돌. |

## 진입 게이트 (ADR-018 §1)

- **AND 항 1 (객관 데이터)**: 사용자 자체 구현 신뢰 상실 발화("안 되는 첫 기능 실망") + 비전 §2.2 OSS 통째 재사용 강제 = 객관 항목.
- **AND 항 2 (사용 사례)**: 비전 §16 "단일 추상 OS" 자체가 사용 사례 1건. phase3-snapshot §4 카탈로그 형식상 S3(작업 학습 패턴) + L6 Persona 통합이 첫 점화점.
- **§3 우회 채널 사용 안 함**: 두 항 모두 충족.

## 결과

### 본 사이클 (PR-V3.0/V3.1) 진행 가능 항목

- ADR-020 채택 완료(`5142099`) → 본 ADR-019 채택 가능.
- 본 ADR 채택 후 PR-V3.1 Honcho PoC 시작 가능.

### 후속 ADR / PR

- **PR-V3.1** (본 사이클): `@honcho-ai/sdk` 설치 + `HonchoBridge` 1차 + `docker-compose.honcho.yml` + 단위 테스트.
- **PR-V3.4** (후속): OpenClaw 포맷 incorporate.
- **PR-V3.5** (후속): Graphiti 모델로 ClaimStore 보강.
- **별도 ADR**: Honcho server 패치 기여 시점 / OpenClaw 포맷 안정성 검증 후 PR-V3.4 진입 ADR.

## 거부 대안

### X1. Honcho 도입 보류, 자체 inferred-profile 구현
- 거부 사유: 비전 §2.1 "Honcho 반드시 사용" 직접 위반. 사용자 명시 발화 위반. 자체 구현 신뢰 부재.

### X2. Honcho SaaS 모드 (자체호스팅 회피)
- 거부 사유: 사용자 데이터 외부 의존. 개인 메모리 OS 정신 위반. memory-brain은 local-first 정신.

### X3. OSS 코드 통째 incorporate (Honcho server 소스 fork)
- 거부 사유: AGPL 전염 위험 + 유지보수 부담↑. self-host docker 사용이 격리 + 업스트림 추종 양측 충족.

### X4. OpenClaw / Graphiti 도 통째 incorporate (코드 fork)
- 거부 사유: 두 OSS 모두 신생(2026) — API 안정성 미검증. 포맷·모델 답습이 신뢰 + 유연성 균형.

## 참고

- ADR-018 (`docs/adr/018-phase-entry-gate-meta.md`) — §1 게이트 정신 인용
- ADR-020 (`docs/adr/020-license-policy.md`) — 본 ADR 선행
- ADR-012 (`docs/adr/012-claim-evidence-sidecar.md`) — PR-V3.5 amend 토대
- `.omc/wiki/vision-7-layer-arch.md` — 7-layer × OSS 매핑 (2026-04-27 조사)
- `memory_system_improvement_prompt.md` — 비전 §2.1 §2.2 §7 §16
- npm registry 라이선스 확인: `@honcho-ai/sdk@2.1.1` license = "Apache-2.0"
- Honcho self-host: https://github.com/plastic-labs/honcho (docker-compose 공식 가이드)
- OpenClaw: https://github.com/openclaw/openclaw (MIT, 2026-01 출시)
- Graphiti: https://github.com/getzep/graphiti (Apache-2.0)
