# CFGM-OS — memory-brain

> **Claim-Grounded, Persona-Aware Memory Routing OS** — AI 에이전트의 기억을 "거대한 텍스트 덤프"가 아니라 **근거 기반·라우팅되는·실행 가능한 지식 그래프**로 관리하는 오픈소스 메모리 엔진.

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg) ![Runtime: Bun](https://img.shields.io/badge/Runtime-Bun%20%E2%89%A5%201.1-black) ![LLM API calls: 0](https://img.shields.io/badge/LLM%20API%20calls-0-blue)

Claude Code · Codex · Gemini CLI 같은 **host CLI 위에서 동작**하는 영구 메모리 엔진입니다. MCP 서버도, API 키도, 추가 구독도 요구하지 않습니다 — 인터페이스는 파일과 자연어 명세뿐입니다.

## 왜 만들었나 — 4가지 페인포인트

| 페인포인트 | CFGM-OS 의 해법 |
|---|---|
| **컨텍스트 비대화** — `CLAUDE.md`/`MEMORY.md` 에 지식을 쌓으면 매 세션 통째로 주입 | bootloader + retrieval policy 라우팅: 요청 분류 → lane 선택 → 필요한 1~3개 파일만 조회 |
| **메모리 부패** — 무조건 append 로 중복·모순·낡은 정보 누적 | upsert/merge/supersede + governance 리포트 (중복·stale·모순·decay) |
| **근거 없는 기억** — LLM 추론이 검증된 사실처럼 저장 | claim/evidence 원장 — 모든 주장에 evidence pointer, 추론 persona 는 confidence 표기 + 별도 레이어 격리 |
| **prose 스킬의 한계** — SKILL.md 는 실행 순서·분기·성공 기준이 암묵적 | SSL (Scheduling–Structural–Logical) 타입 지식 그래프 — 검색·리스크 게이트·학습/재실행·실행까지 |

## 설계 원칙 5 ([`docs/RULES.md`](./docs/RULES.md))

1. **MCP 미사용** — 파일 + 자연어 명세만. vendor-agnostic.
2. **구독 auth 위임** — LLM SDK 직접 호출 금지. 엔진은 명세(prompt+schema)만 만들고 실제 LLM 호출은 host CLI 에 위임 → **사용자 추가 비용 0**.
3. **외부 orchestration 도구 비의존** — `git clone` 만으로 단독 동작.
4. **Production 품질** — 테스트 986개 · 신규 코드 커버리지 ≥90% · typecheck · 회귀 0 게이트.
5. **분리 프로파일** — persona(추론)와 canonical knowledge(검증 사실)를 레이어로 분리, mutate 작업은 별도 PAI 세션에서.

## 벤치마크 — 주장이 아니라 수치

**외부 표준: [LongMemEval](https://github.com/xiaowu0162/LongMemEval)** (ICLR 2025) — session-level retrieval, 500문항, **LLM 호출 0회·89초·재현 스크립트 포함**:

| | R@1 | R@3 | R@5 | R@10 | MRR |
|---|---|---|---|---|---|
| V3.29 (초기) | 55.2% | 85.9% | 91.7% | 94.5% | 0.909 |
| V3.30 (튜닝) | 56.6% | 87.2% | 92.2% | 96.2% | 0.927 |
| **V3.32 (+PRF, 전체 500)** | 56.6% | 87.2% | **93.7%** | **96.5%** | **0.928** |
| **V3.32 held-out test (확증)** | 56.7% | 86.2% | **93.2%** | 95.8% | 0.921 |

V3.32 부터 **held-out split** (dev 245 튜닝 전용 / test 255 확증 전용, 결정론적 해시 분할) 을 도입해 과적합 의심을 차단합니다. 측정 규약·튜닝 로그(기각 기법 포함)·재현 절차·한계는 [`docs/BENCHMARK.md`](./docs/BENCHMARK.md) 참조.

**풀 QA 트랙 실측** (2026-07-22, host-위임 Sonnet 답변 생성 + LLM judge, 500/500): **QA accuracy 86.2%** — single-session-assistant 100% · user 98.6% · knowledge-update 93.6% · temporal 88.0% · multi-session 77.4% · preference 43.3% (retrieval 약점이 그대로 전파 — 알려진 튜닝 대상). 상세: `memory/reports/longmemeval-qa.md`

```bash
# 재현 (데이터셋 265MB — repo 미포함, MIT)
mkdir -p data/longmemeval && cd data/longmemeval
curl -LO https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json
cd ../.. && cfgm bench-lme
```

알려진 약점도 리포트에 그대로 노출합니다 (single-session-preference 유형, [CHANGELOG](./CHANGELOG.md) V3.30 참조). 내부 품질 벤치(`cfgm bench`)는 router lane 적중률·검색 recall 을 회귀 게이트로 측정합니다. 벤치 정답에서 역산한 상수를 검색 코드에 넣는 것은 과적합으로 금지합니다.

## Quick Start

**Prerequisites**: [Bun](https://bun.sh) ≥ 1.1 (+ 훅 통합 시 Claude Code CLI)

```bash
git clone https://github.com/treestar84/memory-brain.git && cd memory-brain
bun install
bun link                          # 전역 `cfgm` 명령 등록 (선택)
cfgm doctor                       # 자가진단 — 부족한 항목과 조치 명령을 알려줌
cfgm rebuild-index --embeddings   # 검색 인덱스 생성 (hybrid 포함)
```

Claude Code 훅 통합(세션 영구 메모리)까지 원하면 `./install.sh` 를 추가 실행합니다. **훅 없이도 모든 CLI 는 단독 동작합니다.** 제거는 `cfgm uninstall`.

## 통합 CLI — `cfgm`

52개 스크립트의 단일 진입점. `cfgm help` 로 그룹별 전체 목록:

```bash
cfgm doctor              # 설치·환경 자가진단 (7항목 + 조치 명령 제시)
cfgm bench               # 내부 memory quality benchmark
cfgm bench-lme           # LongMemEval 외부 벤치마크
cfgm ssl-status          # SSL normalize 큐 상태 (+stale)
cfgm viewer              # KG-Brain 대시보드 (localhost:4041)
cfgm run --skill <slug>  # SSL 스킬 실행 계획 / --interactive
```

전역 등록 없이 쓰려면 `bun run bin/cfgm.ts <command>`. registry 에 없는 이름도 `bin/cfgm-<name>.ts` 가 존재하면 실행됩니다.

## Architecture — 7-layer

| Layer | 위치 | 역할 |
|---|---|---|
| L1 Bootloader | `CLAUDE.md` + `MEMORY.md` | 메모리 사용 규칙만 (지식 저장 금지) |
| L2 Router | `memory/ROUTER.md` + `src/core/router/` | retrieval policy — 요청 분류 → lane → 파일 1~3개 |
| L3 Wiki | `memory/{projects,concepts,decisions}/` | canonical knowledge (markdown + frontmatter) |
| L4 Claim | `memory/claims/ledger.jsonl` | claim/evidence 원장 (append-only + projection) |
| L5 Graph/Search | `.memory-brain/indexes/` (SQLite FTS5) | **파생물** — markdown 에서 rebuild 가능 |
| L6 Persona | `memory/profile/*.jsonl` | 추론 프로파일 (confidence 표기, fact 와 격리) |
| L7 Governance | `memory/reports/` | 중복·stale·모순·decay 리포트 |

코드 레벨: **Adapters** (platform JSON → CanonicalEvent) / **Core** (platform-free 순수 함수) / **Storage** (주입 가능 인터페이스). 결정 기록은 [`docs/adr/`](./docs/adr/).

### PAI 세션 — 분리 영속 세션 (원칙 5)

mutate 작업(SSL normalize, governance 등)은 메인 세션이 아니라 **별도 PAI 세션**이 처리합니다. 두 세션은 `memory/` 파일 시스템으로만 통신합니다:

```bash
# 별도 터미널에서:
CLAUDE_CONFIG_DIR=.claude-pai claude
```

메인 세션이 `cfgm ssl-enqueue` 로 작업을 큐에 넣으면, PAI 세션이 hook 주입 시 자동 감지해 처리합니다. 세션이 죽어 고아가 된 job 은 lease 기반으로 회수됩니다: `cfgm ssl-status` 가 stale 을 표시하고 `cfgm ssl-reap` 이 재큐/실패 처리합니다 (attempts/max_attempts=3/lease 60분 — 계약: `memory/_pending/normalize/_spec/prompt.md`).

## 핵심 기능

### KG-Brain — SKILL.md → SSL 지식 그래프

`.claude/skills/**` 의 prose 스킬을 타입 그래프로 정규화합니다. SKILL.md 가 source-of-truth, SSL JSON 은 파생물입니다.

```bash
cfgm ssl-enqueue     # heuristic 1차 + hole 있는 스킬은 PAI 큐로
cfgm ssl-status      # 큐 상태
cfgm rebuild-index   # wiki + claim + SSL 인덱싱
cfgm ssl-stats       # canonical 사용률 등 지표 (실측: 96%)
cfgm viewer          # 대시보드 — 3-layer 시각화·검색·risk findings
```

### Workflow Learn & Replay

세션에서 수행한 워크플로우를 SSL 로 저장하고 다음 세션에서 재실행합니다.

```bash
cfgm learn --name my-flow --goal "..."   # 학습 → memory/workflows/<slug>.md
cfgm replay --query "ssl normalize"      # SSL Scene DAG 순서의 replay plan 생성
cfgm replay --list
```

SKILL.md 단독 대비: 실행 순서(Scene DAG)·분기(DecisionNode)·사용자 pause(InteractionNode)·성공 기준(EvidenceNode)·위임 규약(ProtocolNode)이 전부 명시적입니다.

### Executable SSL — `cfgm run`

SSL JSON 만으로 스킬을 실행합니다 (SKILL.md 불필요):

```bash
cfgm run --skill app-store-screenshots               # 실행 계획
cfgm run --skill app-store-screenshots --interactive # 단계별 실행
```

`logical[]` 노드의 `instructions` 필드가 실행 계획에 포함됩니다 (optional, back-compat).

### KG Graph + 체인 추론

cross-skill 엣지가 물질화된 전역 그래프 (`CONTAINS`/`TRANSITIONS_TO`/`INSTANTIATES`/`DELEGATES_TO`/`SCOPED_TO`):

```bash
cfgm graph-query neighbors <node_id> --relation DELEGATES_TO
cfgm compose                        # DELEGATES_TO 전이 폐포 → COMPOSES 트리플 + 사이클 감지
cfgm find-chain --goal "..."        # goal → 스킬 체인 발견 (--replay 연동)
```

### Hybrid 검색 (opt-in)

FTS5 BM25 에 의존성 0 의 결정론적 n-gram 벡터를 융합합니다 — 오타·형태소 변형 쿼리 구제. 융합 전략 3종(`rescue` 기본 / `rescue-rerank` / `rrf`)은 전부 실측 근거로 선택됐습니다 ([EXTENDING.md §2](./docs/EXTENDING.md)). 벡터 없는 인덱스에서는 FTS 로 안전하게 fallback. 실제 embedding 모델은 `Embedder` 인터페이스 구현으로 주입합니다.

### OKF Export

L3 wiki 를 Google [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf) v0.1 번들로 내보냅니다 (wiki 가 truth, OKF 는 어댑터 뒤 파생물):

```bash
cfgm okf-export --out dist/okf --active-only
```

### LongMemEval 풀 QA 트랙 (host-위임)

공식 QA accuracy 까지 측정하려면 — SDK 호출 없이 PAI 세션에 위임:

```bash
cfgm lme-enqueue                    # answer job 생성 (retrieval top-k 컨텍스트)
# → PAI 세션이 처리
cfgm lme-score                      # proxy 채점 (EM/contains/token-F1)
cfgm lme-score --judge-enqueue      # semantic 판정 job 생성 → PAI 처리
cfgm lme-score --collect            # 공식 지표 (judge accuracy) 집계
```

## 문서 지도

| 문서 | 내용 |
|---|---|
| [`docs/RULES.md`](./docs/RULES.md) | 아키텍처 원칙 5 + 위반 처리 (새 코드 전 필독) |
| [`docs/EXTENDING.md`](./docs/EXTENDING.md) | 확장 seam 8종 계약 — Embedder·fusion·Router·어휘·host-위임 큐 |
| [`memory/SCHEMA.md`](./memory/SCHEMA.md) | 디렉토리 트리 명세 |
| [`memory/ROUTER.md`](./memory/ROUTER.md) | retrieval policy |
| [`docs/adr/`](./docs/adr/) | Architecture Decision Records |
| [`CHANGELOG.md`](./CHANGELOG.md) | 버전별 변경 + 실측 기록 (퇴행 포함 정직 보고) |

## Test

```bash
bun test              # 986 tests
bun run typecheck
```

## Storage Paths

- 사용자 레벨: `~/.claude-brain/memory-brain/` (또는 `CFGM_HOME`)
- 프로젝트 레벨: `$PROJECT/.memory-brain/` (`CFGM_PROJECT_ROOT` 지정 시)

## License

MIT
