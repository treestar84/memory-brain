# memory-brain — Agent Bootloader (Codex / non-Claude 호스트용)

> `CLAUDE.md` 와 동일한 규칙의 Codex CLI 등 다른 host 용 버전입니다. Claude Code 는
> `CLAUDE.md` + hook 자동 주입을 쓰지만, Codex 는 이 파일을 세션 시작 시 직접 읽습니다.
> **전체 메모리를 읽지 말고 아래 규칙만 따르세요.**

## 왜 이 파일이 필요한가

memory-brain 은 host 에 종속되지 않는 순수 CLI + 파일 기반 메모리 엔진입니다
(MCP 없음, host 구독 인증만 사용, 특정 오케스트레이션 레이어에 의존하지 않음).
어떤 host 에서 실행되든 `cfgm` 명령과 `memory/` 디렉토리만으로 동일하게 동작합니다.

## 30초 안에 확인하기 (효능 체감)

```bash
cfgm doctor                       # 설치 상태 자가진단
cfgm rebuild-index --embeddings   # 검색 인덱스 생성 (최초 1회 / memory/ 변경 시)
cfgm search "메모리 라우팅"        # 자연어로 즉시 검색 — 결과가 나오면 정상 동작
```

`cfgm search` 가 `memory/{projects,concepts,decisions}/*.md` 에서 스니펫과 함께
결과를 반환하면 메모리 엔진이 살아있다는 뜻입니다. 결과가 비어 있으면 아직
`memory/` 에 해당 주제의 wiki page 가 없다는 뜻이지, 오류가 아닙니다.

## 메모리 사용 규칙 (CLAUDE.md 와 동일)

1. **전체 메모리 읽지 말 것**. 요청을 받으면 먼저 `memory/ROUTER.md` 의 retrieval
   policy 만 본다.
2. **source/evidence 우선**: claim 답변 시 evidence pointer 인용 의무. evidence
   없는 high-confidence claim 금지.
3. **persona ≠ fact**: `memory/profile/representations.jsonl` 의 inferred profile
   은 confidence 표기 의무. 사용자 반박 시 즉시 수정.
4. **routing policy 따르라**: `ROUTER.md` §라우팅 제한 — canonical page 동시 ≤ 3,
   source 는 검증 필요 시만.
5. **append-only + projection**: 모든 ledger 는 새 엔트리 + last-wins reduce.
   직접 수정 금지.

## 진입점

| 경로 | 역할 |
|---|---|
| `memory/ROUTER.md` | retrieval policy (지식 목록 아님, 정책만) |
| `memory/current.md` | 현재 작업 컨텍스트 (1쪽) |
| `memory/SCHEMA.md` | 디렉토리 트리 명세 |
| `docs/RULES.md` | 아키텍처 원칙 5 + 위반 처리 — 새 코드 추가 전 필독 |
| `docs/EXTENDING.md` | 확장 seam 8종 |

## 자주 쓰는 명령

```bash
cfgm help                          # 전체 명령 그룹별 목록
cfgm search "<질의>" [--limit N]   # wiki 자연어 검색
cfgm ssl-enqueue                   # .claude/skills/**(SKILL.md) → SSL 지식그래프 변환
cfgm viewer                        # 대시보드 (localhost:4041)
cfgm graph-query neighbors <id>    # KG 그래프 탐색
```

세션 영구 메모리(자동 hook 주입)는 Claude Code 전용 기능이며, Codex 등 다른
host 에서는 **CLI 를 직접 호출**하는 방식으로 동일한 memory/ 상태를 공유합니다 —
같은 저장소를 쓰는 한 host 를 섞어 써도 데이터는 정합합니다.

## 절대 규칙

- `CLAUDE.md` / `AGENTS.md` / `MEMORY.md` 에 **모든 지식을 넣지 말 것** —
  bootloader 만.
- `inference` 를 **검증된 fact 로 저장하지 말 것** — confidence + evidence
  pointer 의무.
- 오래된 정보를 **삭제만으로 처리하지 말 것** — supersede / decay / archive
  우선.
