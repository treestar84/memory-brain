# SSL Normalize Pending Queue

> **PAI 세션이 자율 처리하는 작업 큐.** memory-brain 본체는 별도 LLM API 를 호출하지 않는다 (`docs/RULES.md` 원칙 2). 본 디렉토리의 모든 인터페이스는 **파일과 자연어** 만으로 구성된다.
>
> **처리 주체**: `.claude-pai/` 프로파일로 실행된 **PAI 세션** (영속 단일 세션, 원칙 5). 메인 세션은 본 큐에 enqueue 만 하고 처리에는 동원되지 않는다.

## 디렉토리 구조

```
memory/_pending/normalize/
├── README.md                    ← 본 파일 (host LLM 이 작업 시작 시 읽음)
├── _spec/
│   ├── ssl-schema.md            ← SSL 0.2.0 schema + closed vocabulary 정의
│   └── prompt.md                ← normalize 작업 프롬프트 템플릿
└── jobs/
    └── <slug>.job.md            ← 1 작업 = 1 파일
```

## PAI 세션 처리 흐름

PAI 세션은 `SessionStart` / `UserPromptSubmit` hook 으로 큐 상태를 자동 인지한다 (`.claude-pai/settings.json`). 사용자가 별도 명령을 주지 않아도 매 턴 시작 시 status 가 시스템 컨텍스트로 주입된다.

PAI 세션이 처리할 때:

1. 시스템 컨텍스트의 status JSON 에서 `pending > 0` 확인.
2. `_spec/ssl-schema.md` + `_spec/prompt.md` 를 read tool 로 로드.
3. `jobs/*.job.md` 중 frontmatter `status: pending` 인 항목을 순회. 각 job 의 frontmatter 가 가리키는 `source_path` (원본) + `heuristic_path` (sidecar JSON) 을 read.
4. `_spec/prompt.md` 의 지시에 따라 enriched SSL JSON 을 생성하여 `output_path` 에 write.
5. `bun run bin/cfgm-ssl-validate.ts <output_path>` 호출 → exit 0 이면 job frontmatter `status: done`, exit ≠ 0 이면 `status: failed` + `failure_reason` 기록.
6. 다음 pending job. 큐 빌 때까지 반복 후 idle.

## 작업 enqueue 방법 (개발자 / 사람)

```bash
bun run bin/cfgm-ssl-enqueue.ts                        # 새 / stale skill 자동 감지하여 enqueue
bun run bin/cfgm-ssl-enqueue.ts --skill <path>         # 특정 skill 한 건만
bun run bin/cfgm-ssl-status.ts                         # 큐 상태 보기
```

`enqueue` 는 heuristic SkillNormalizer 를 1차로 돌려 warnings 가 있는 항목만 큐에 올린다. heuristic 만으로 충분한 항목은 즉시 `memory/concepts/_ssl/<slug>.json` 에 기록되고 큐를 거치지 않는다.

## 원칙

- 본 큐는 **append-only**. 처리 완료된 job 은 status 를 `done` 으로 바꾸되 파일은 보존 (audit trail).
- 30 일 경과한 `done` job 은 `_archive/` 로 이관 (`bin/cfgm-ssl-archive.ts`, 추후 PR).
- `failed` job 은 그대로 유지 + 사람이 검토 후 수동 재시도 (`status: pending` 으로 변경).
- `in_progress` 가 24 시간 이상 지속되면 host LLM 이 중단된 것으로 간주 → 사람이 검토.

## 본 큐의 정체성

- memory-brain 의 **분리 세션 자율 처리 모범** (원칙 5).
- 메인 세션은 enqueue 만, PAI 세션은 처리. 두 세션은 `memory/` 파일 외 통신 채널 없음.
- LLM provider 별 SDK · MCP · plugin 의존성 0.
- 사용자 구독 auth 채널을 그대로 활용 — 별도 API 비용 발생 없음.
