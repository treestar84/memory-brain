# Capture Pending Queue

> **PAI 세션이 자율 처리하는 작업 큐.** memory-brain 본체는 별도 LLM API 를 호출하지 않는다 (`docs/RULES.md` 원칙 2). 본 디렉토리의 모든 인터페이스는 **파일과 자연어** 만으로 구성된다.
>
> **처리 주체**: `.claude-pai/` 프로파일로 실행된 **PAI 세션**. 메인 세션은 본 큐에 enqueue 만 하고 처리에는 동원되지 않는다.

## 디렉토리 구조

```
memory/_pending/capture/
├── README.md                    ← 본 파일
├── _spec/
│   └── prompt.md                ← capture 작업 프롬프트 (host LLM 용)
├── jobs/
│   └── <slug>.job.md            ← 1 작업 = 1 source 파일
└── drafts/
    └── <page-slug>.md           ← host LLM 이 작성한 wiki page draft (status: draft)
```

## 목적

세션 transcript / 노트 파일에서 **장기적으로 기억할 가치가 있는 지식**(개념 정의, 결정과 근거, 프로젝트 사실)을 host LLM 이 wiki page draft 로 추출한다. `cfgm capture-accept` 로 검토 후 `memory/{concepts,decisions,projects}/` 로 승격한다.

## 작업 enqueue 방법

```bash
bun run bin/cfgm-capture.ts --input <파일|디렉토리>     # SHA stale 체크 후 enqueue
bun run bin/cfgm-capture.ts --input <경로> --force       # 재처리 강제
bun run bin/cfgm-capture-status.ts                       # 큐 + drafts 상태
bun run bin/cfgm-capture-accept.ts <slug> --type concept  # draft 승격
```

## 원칙

- 본 큐는 **append-only**. 처리 완료된 job 은 status 를 `done` 으로 바꾸되 파일은 보존.
- `failed` job 은 그대로 유지 + 사람이 검토 후 수동 재시도 (`status: pending`).
- draft 승격 시 기존 wiki page 와 중복이면 append 하지 말고 upsert/merge/supersede (CLAUDE.md 절대 규칙).
