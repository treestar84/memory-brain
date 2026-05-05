# memory/current.md — 현재 작업 컨텍스트 표면

> 비전 §4 답습. 본 파일은 **현재 진행 중인 작업의 1쪽 요약**.
> 사용자 또는 Claude 본체가 session-start / session-end 시점에 갱신.
> 너무 길어지면 `memory/projects/{slug}.md` 또는 `memory/journal/`로 이관.

## 형식

```markdown
## 최근 진행 (2026-04-27)

- vision evolution Phase A1.0 (claim sidecar) 머지 → ADR-012/PR-A1.0
- ADR-018 phase 게이트 메타 채택
- plan v3 전환: ADR-019(OSS 도입) → ADR-021(Honcho self-host 회수)
- PR-V3.0/V3.1 머지: 라이선스 MIT + 자체 PersonaStore (markdown+jsonl)

## 현재 작업

- PR-V3.2: memory/ 디렉토리 트리 + bootloader 재작성 (vision §14.1) — 진행 중

## 다음 단계

- PR-V3.3: ROUTER 1차 (RequestClassifier + LaneSelector 코드 구현)
- PR-V3.4: Wiki Layer (sources/projects/concepts/decisions, OpenClaw 포맷)

## 미해결 질문

(없음 — 사용자 합의 단계 모두 통과)

## 관련 ADR / commits

- 최근: ADR-021 (3c7027e), ADR-018 (64597ff)
- plan: .omc/plans/vision-evolution-claim-grounded-os.md (v2 superseded)
- 비전: memory_system_improvement_prompt.md
```

## 운영 규칙

- **갱신 주기**: 의미 있는 진행 1건 이상 발생 시 1줄 추가 또는 섹션 갱신.
- **크기 상한**: ~ 100줄. 초과 시 `memory/journal/YYYY-MM-DD.md`로 일부 이관.
- **자동 갱신**: 후속 PR-V3.3 ROUTER + cfgm-process 통합 시 Claude 본체가 session-end 직후 자동 후보 생성. 사용자 검토 후 commit.
- **본 1차**: 사용자/Claude 명시 갱신만. 자동 갱신 아직 없음.

## 현재 상태 (placeholder)

- vision evolution Phase A1·A1.1 진행 중 (plan v3, 2026-04-27)
- 본 파일은 PR-V3.2 머지 직후 상태
- 다음 갱신은 PR-V3.3 시작 시점

## PR-V3.12 (2026-05-05) — KG-Brain 본체 schema 채택

- arXiv 2604.24026 SSL(Scheduling–Structural–Logical) 표현을 본체 schema로 채택
- `src/core/ontology/ssl.ts` — closed vocabulary (Scene/Action/ResourceScope) + validateSSL
- `src/core/normalizer/SkillNormalizer.ts` — heuristic md→SSL 1차 (LLM normalizer는 PR-V3.13)
- 결정: SKILL.md = source-of-truth, SSL JSON = derived/rebuildable
- 테스트 7/7 통과, coverage 95%
- 관련: `memory/decisions/ssl-kg-brain.md`, `memory/concepts/ssl-skill-representation.md`

## PR-V3.14 (2026-05-05) — SSL skill discovery (rich-field weighted retrieval)

- 논문 §4.1 rich-field weighted retrieval을 `SearchIndex.searchSkills`로 구현
- `ssl_skills` FTS5 테이블 추가 (Scheduling/Structural/Logical 3 컬럼) + bm25 가중치 (3.0/1.5/1.0)
- 쿼리 prefix-match (`failure*`)로 morphology 관용도 확보 — FTS5 unicode61 stemming 부재 보정
- schema_version 1→2 (back-compat: `skills` 옵션 미지정 시 ssl_skills 비어 있음)
- 테스트 8/8 통과, 회귀 0건 (전체 723/723 pass)
- Indexer 통합: `SSLReader` 신설 + `Indexer` 가 `memory/concepts/_ssl/*.json` 스캔 (sslReader 옵셔널, back-compat)
- 다음: PR-V3.13 (LLM normalizer, paper §3.3) 또는 PR-V3.15 (risk gate, §4.2)

## PR-V3.15 (2026-05-05) — SSL risk gate (governance detector)

- `src/core/governance/reports/SSLRiskDetector.ts` — rule-based SSL risk classifier
- `GovernanceInput.skills?: SSLDocument[]` 추가 (back-compat)
- 규칙: CREDENTIALS scope=critical, WRITE×NETWORK=warning, WRITE in non-ACT scene=warning, 3+ resource scopes=info
- 테스트 8/8 통과
- 다음: PR-V3.13 (LLM normalizer, paper §3.3) 또는 PR-V3.16 (risk classifier ML, paper §4.2 Table 3)

## PR-V3.12-CLI (2026-05-05) — cfgm-ssl-normalize + rebuild-index 통합

- `bin/cfgm-ssl-normalize.ts` — `.claude/skills/**` → `memory/concepts/_ssl/<slug>.json`. SHA256 stale 비교로 변경분만 재생성. `--force`/`--input`/`--output`/`--json` 지원
- `bin/cfgm-rebuild-index.ts` — SSLReader 주입. 단일 명령으로 wiki+claim+SSL 모두 인덱싱
- 테스트 4/4 (CLI), 회귀 0건 (전체 739/739)
- end-to-end working slice 완성: `cfgm-ssl-normalize` → `cfgm-rebuild-index` → `searchSkills(query)`

## PR-V3.12.1 (2026-05-05) — SSL schema 풍부화 (사용자 example 정렬)

- SSL_VERSION 0.1.0 → 0.2.0 (호환 깨짐, 기존 _ssl/*.json 없음 — 안전)
- Scheduling 신규 필드: `skillGoal`, `intentSignatures[]`, `expectedInputs[]`, `expectedOutputs[]`, `dependencies[]`, `controlFlowFeatures[]`
- Structural 신규: `sceneGoal` (능동 목표 표현)
- Logical 신규: `resourceTarget?`, `effects[]` (post-condition slot)
- ACTIONS 확장: `+SCHEDULE`, `+TRANSFORM`
- RESOURCE_SCOPES 확장: `+DATABASE`, `+QUEUE`
- ControlFlowFeature 신규 enum (branching/loop/scheduled_retry/network_access/credential_access/long_running/stateful)
- heuristic normalizer가 dependencies/controlFlowFeatures/expectedInputs/Outputs 까지 자동 채움 (LLM normalizer가 메울 hole은 warnings[])
- 테스트 740/740 pass

## PR-V3.13 revert (2026-05-05) — `docs/RULES.md` 원칙 위반으로 회수

- 회수 commit `ccb026f`. 사유: 원칙 1·2 위반.
  - 원칙 2 위반: `@anthropic-ai/sdk` default 흐름 직접 호출 + `ANTHROPIC_API_KEY` 요구 → 사용자 비용 추가 발생.
  - 원칙 4 위반: vendor lock-in (claude-opus-4-7 하드코딩) — production OSS 부적합.
- 제거: `src/core/normalizer/LLMSkillNormalizer.ts`, 테스트, `--llm`/`--model` CLI 플래그.
- 의존성 제거: `@anthropic-ai/sdk`, `zod`.
- LLM normalize 의 올바른 패턴은 PR-V3.13-rev2 — file-based pending queue + host CLI 의 LLM 위임.

## PR-V3.13-rev2 (2026-05-05) — File-based pending normalize queue (host-delegated)

- `memory/_pending/normalize/_spec/{ssl-schema,prompt}.md` — host LLM 이 read tool 로 읽을 명세
- `memory/_pending/normalize/jobs/<slug>.job.md` — 1 작업 = 1 파일 (frontmatter status: pending|in_progress|done|failed)
- `bin/cfgm-ssl-enqueue.ts` — heuristic 1차 + warnings 있는 skill 을 job 으로 enqueue
- `bin/cfgm-ssl-validate.ts` — 1 job 결과 검증 (validateSSL gate)
- `bin/cfgm-ssl-status.ts` — pending/done 통계
- 호출 진입점 0 — 파일과 자연어만으로 vendor-agnostic. host LLM 이 자기 inference 채널로 처리.

## PR-V3.13-rev2.1 (2026-05-05) — fence-collision fix + 첫 실데이터 시범 + KG-Brain Dashboard

**Fence collision 수정**
- 기존 job.md 내부 ` ```json` 블록이 source SKILL.md 안의 ` ```json` 과 충돌해 일부 skill (예: bmad-distillator, bmad-review-edge-case-hunter) 의 heuristic JSON 추출 실패.
- 해결: heuristic 을 `<slug>.heuristic.json` sidecar 파일로 분리. job.md 는 frontmatter + reference link 만.
- 영향: enqueue/viewer/_spec/prompt.md/test 모두 sidecar 모델로 갱신.

**첫 실데이터 시범 (작업 A)**
- `.claude/skills/**` 11 건 모두 enqueue 성공. 11/11 pending (heuristic 만으론 hole 1+).
- ROUTER → SearchIndex → SSLRiskDetector end-to-end 정상 동작.

**KG-Brain Dashboard (`bin/cfgm-ssl-viewer.ts` + `.html`)**
- Bun.serve() + HTML import (CLAUDE.md Bun 정책 준수). 외부 React/Tailwind/MCP 의존성 0.
- 5 endpoint: `/api/skills`, `/api/skills/:slug`, `/api/search`, `/api/queue`, `/api/risk`.
- UI: skill list + detail (Scheduling/Structural/Logical 3-layer 시각화) + search + risk findings + warnings 목록.
- XSS-safe DOM API (innerHTML 미사용).
- 사용법: `bun run viewer:ssl` → http://localhost:4041

**검증**: 749/749 pass · typecheck OK · 회귀 0건.
