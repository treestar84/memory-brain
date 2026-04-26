# Honcho 자체호스팅 가이드 (PR-V3.1, ADR-019)

memory-brain 의 L6 Persona Layer 는 Honcho 서버를 별도 컨테이너로 격리해 사용한다. 본 문서는 자체호스팅 절차를 정리한다.

## 사전 준비

- Docker Desktop (또는 docker engine + compose v2 plugin)
- 디스크 ≥ 1GB (Postgres + pgvector 데이터)
- 메모리 idle 200MB+ 여유

## 환경 변수 설정

프로젝트 루트에 `.env.honcho` 파일 생성 (git 으로는 추적 안 함):

```bash
HONCHO_DB_PASSWORD=your-strong-password
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
HONCHO_AUTH_KEY=your-local-auth-key
```

**주의**: `.env.honcho` 는 `.gitignore` 에 포함되어 있어야 함 (별도 commit 으로 추가 권장).

## 기동

```bash
docker compose -f docker-compose.honcho.yml --env-file .env.honcho up -d
```

기동 확인:

```bash
curl http://localhost:8000/health
# 기대 응답: {"status": "ok"} (Honcho 버전에 따라 다를 수 있음)
```

Postgres 직접 접속이 필요하면 `localhost:5433` (5432 충돌 회피).

## memory-brain 측 SDK 설정

`@honcho-ai/sdk` (Apache-2.0) 는 이미 dependencies 에 포함됨 (`bun add @honcho-ai/sdk`).

연결 예시 (후속 PR-V3.2 wiring 시 사용):

```typescript
import { Honcho } from "@honcho-ai/sdk";

const honcho = new Honcho({
  apiKey: process.env.HONCHO_AUTH_KEY,
  workspaceId: "memory-brain-local",
  baseURL: "http://localhost:8000",
});
```

## 정지 / 데이터 삭제

```bash
# 정지 (데이터 보존)
docker compose -f docker-compose.honcho.yml down

# 정지 + 데이터 삭제
docker compose -f docker-compose.honcho.yml down -v
```

## AGPL-3.0 격리 (ADR-019)

- Honcho 서버는 AGPL-3.0 라이선스. memory-brain 본체는 MIT (ADR-020).
- 본 가이드의 격리 형태(별도 컨테이너 + HTTP 호출)는 AGPL 전염을 방지한다.
- Honcho server 자체에 패치 기여 시점에는 AGPL 의무 발동 — 그 시점에 별도 ADR 작성.
- SDK (`@honcho-ai/sdk`) 는 Apache-2.0 라 import 자유 (npm registry 확인 완료, ADR-019 §결과).

## 트러블슈팅

| 증상 | 원인 / 처방 |
|---|---|
| port 8000 이미 사용 | `docker-compose.honcho.yml` 의 `ports` 매핑을 다른 포트로 변경 |
| port 5433 이미 사용 | 같은 패턴으로 변경 |
| `/health` 응답 timeout | `docker logs memory-brain-honcho` 로 로그 확인. 보통 LLM API 키 누락 |
| Postgres init 실패 | volume `memory-brain-honcho-db-data` 삭제 후 재기동 |

## 참고

- ADR-019 (`docs/adr/019-oss-incorporation.md`)
- ADR-020 (`docs/adr/020-license-policy.md`)
- Honcho 공식 문서: https://github.com/plastic-labs/honcho
- pgvector: https://github.com/pgvector/pgvector
