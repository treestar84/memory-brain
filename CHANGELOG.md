# Changelog

All notable changes to CFGM-OS are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Docs — 한국어 실데모 GIF 추가 (2026-07-26)
- `docs/assets/demo-ko.{gif,tape}` (신규) — 한국어 기본 출력(CFGM_LANG 미설정)으로 `cfgm ask "Honcho self-host 를 철회한 이유" --limit 1` → `cfgm stats` 를 실제 녹화. README.md "30초면 감이 옵니다" 섹션 텍스트 데모와 정확히 동일한 결과(근거 1건, decision.oss-incorporation, claims cl-oss-001~006) — 육안 프레임 검증 완료.
- 녹화 과정에서 발견: `--limit` 미지정 시 기본 5건이 반환돼 캡처 프레임이 낮은 순위 결과(ssl-skill-representation 등)를 보여줘 오진 위험 있었음 — README 정적 데모와 동일하게 `--limit 1` 로 통일해 재녹화.
- README.md 에 GIF 삽입 (정적 텍스트 데모는 접근성·복사용으로 그대로 유지).

### Docs — README 한국어 메인 전환 + 차별화 이미지 (2026-07-26)
- **README 언어 우선순위 역전**: `README.md` 가 다시 한국어 메인(일반 사용자 대상, 간결화)이 되고, 기존 영어 상세판은 `README.en.md` 로 이동(아키텍처·전체 CLI·고급 기능 포함, 내용 무변경). `README.ko.md` 는 새 `README.md` 로 대체돼 삭제.
- **한국어 README 재구성 (approachability 우선)**: 전문용어("Claim-Grounded, Persona-Aware...", 7-layer 등) 로 시작하지 않고 이미지 → 30초 데모 → "왜 다른가 3가지"(평서문) → 설치 → 벤치마크 요약(2줄 표) → 더 알아보기 링크 순으로 재배치. 벤치마크 mermaid 차트·type별 표·아키텍처 다이어그램 등 깊은 내용은 README.en.md/docs/ 로 위임.
- **`docs/assets/why-memory-brain.{svg,png}`** (신규) — memory-brain vs 일반 클라우드 메모리 도구 5행 비교 인포그래픽(서버·API비용·저장형식·답변근거·부패관리). dataviz 스킬 절차 준수(상태색 good=녹색 체크 + 아이콘·라벨 항상 동반, 색상 단독 식별 금지). librsvg 로 실제 래스터화해 텍스트 겹침·정렬 육안 검증.
- 데모 캡처 트리밍 과정에서 claim id 목록을 "~" 범위 표기로, 안내문을 패러프레이즈로 축약했던 초안을 실제 CLI 출력 그대로로 되돌림 (실캡처만 사용 원칙 준수).
- 검증: 1102/1102 pass · typecheck OK · 코드펜스 균형(README.md 12 / README.en.md 46, 둘 다 짝수).

### Docs — 문서 정합성 정리 (2026-07-26)
- **README.ko.md 동기화** — V3.38~V3.40 에서 영어 README 에만 반영되고 한국어판엔 빠져 있던 4곳을 채움: 데모 GIF 임베드, "Memory rot, measured" 후크 섹션(수치·mermaid 원본과 100% 대조 확인), Quick Start 의 "가장 빠른 설치(플러그인)"/"수동 설치" 분리, 문서 지도에 `docs/ROT-BENCH.md` 행 추가.
- **`memory/current.md` 정리** — 자체 운영 규칙("~100줄 상한, 초과 시 journal 이관")을 오래 위반한 상태(287줄, PR-V3.2~V3.17 시절 이력까지 누적)를 시정. PR-V3.2~V3.31 구간을 `memory/journal/2026-07-26.md` 로 전량 이관(내용 손실 없음)하고, V3.32~V3.40 최근 이력 + 다음 단계 후보(90일 rot 실사용 시뮬레이션·Show HN·특허 상담)만 남겨 78줄로 축소.
- **`AGENTS.md` 갱신** — "자주 쓰는 명령" 이 `cfgm search`/`ssl-enqueue`/`viewer`/`graph-query` 4개뿐이라 V3.34~36 에서 추가된 `ask`/`capture`/`decay`/`stats`/`rot-bench` 가 Codex 사용자에게 전혀 안내되지 않던 것을 시정. `CFGM_LANG=en` · Claude Code 플러그인 설치 경로 안내도 추가.
- **테스트 수치 정정** — README(영/한) 4곳에 남아있던 "989+ tests"(V3.28 시점 수치)를 실측 "1100+ tests" 로 갱신.
- 검증: 1102/1102 pass · typecheck OK · 코드펜스 균형 (README.md/README.ko.md 각 46, 짝수) · mermaid 수치 원본 대조 확인.

### Added — V3.40 Claude Code 플러그인 마켓플레이스 (2026-07-26)
- 저장소 자체를 플러그인 마켓플레이스로 겸용 (`.claude-plugin/marketplace.json` + `plugin.json`) — `/plugin marketplace add treestar84/memory-brain` → `/plugin install memory-brain@cfgm-os` 로 git clone 없는 설치 경로 신설.
- **슬래시 커맨드 6종** (`commands/*.md`) — `/memory-brain:setup`, `:search`, `:ask`, `:doctor`, `:capture`, `:stats`. `${CLAUDE_PLUGIN_ROOT}` 가 command 마크다운에서 치환되지 않는 Claude Code 알려진 제약(anthropics/claude-code#9354)을 피해 `cfgm` PATH 의존 자연어 지시로 작성. `/memory-brain:ask` 는 반환된 근거 번들만 사용해 claim id 인용 답변을 생성하도록 지시 (claim-grounded 원칙 유지).
- README.md(영어) 에 "Fastest install" 섹션 신설, 기존 git-clone 경로는 "Manual install" 로 보존. docs/RULES.md 5원칙(MCP 미사용·API 키 불요 등) 위반 없음.
- README.ko.md 동기화는 후속 과제로 보류.
- **보안 리뷰 시정 (커밋 직후, 배경 리뷰 발견)**: 최초 구현은 `SessionStart` 훅이 `cfgm` 부재 시 사용자 승인 없이 `bun install && bun link` 를 자동 실행 — supply-chain-rce(무단 패키지 설치 실행) / silent-failure(`\|\| true` 로 실패 은폐) / silent-global-side-effect(전역 bun link 무단 변경) 3건 지적. **수정**: 훅을 `command -v cfgm` 읽기 전용 안내(부재 시 `/memory-brain:setup` 권유)로 축소하고, 실제 설치는 신설 `/memory-brain:setup` 커맨드가 Claude 의 정상 Bash 도구 승인 흐름을 통해 사용자에게 보여주고 확인받은 뒤 실행하도록 재설계. 3건 전부 이 구조 변경으로 해소. 훅 양쪽 분기(존재/부재) 스텁 바이너리로 재검증.
- 검증: 1102/1102 pass (회귀 0) · typecheck OK · JSON 전건 파싱 확인 · 훅 스크립트 양쪽 시나리오 수동 검증(스텁 cfgm 바이너리 포함).

### Added — V3.39 rot-bench 독립화 — 외부 어댑터 프로토콜 (2026-07-26)
- **subprocess JSONL 어댑터 프로토콜** (`src/core/bench/RotAdapter.ts`) — 언어 무관 stdin/stdout JSONL 로 외부 메모리 도구를 naive/governed 와 동일 체크포인트×문항 조건에서 4번째 조건(`external`)으로 측정. 타임아웃/잘못된 응답/EOF 는 크래시 없이 ranked=[] 로 정직 채점(보정 금지). `cfgm rot-bench --adapter "<command...>" [--adapter-label <name>]`, `--cohort`/`--consolidated` 와 조합 가능.
- **참조 어댑터** (`examples/rot-adapter-bm25.ts`) — 프로토콜 시연용 단순 word-overlap 랭커.
- **`docs/ROT-BENCH.md`** (영어) — 부패 곡선 실측표(기각 로그 포함) + 어댑터 프로토콜 명세 + "measure your memory tool" 초대 + self-reported 결과 제출 규약.
- **실행 중단 버그 수정 (근본 원인)** — `--adapter` 사용 시 CLI 가 결과 출력 후에도 최대 `timeoutMs`(기본 30s) 만큼 종료되지 않던 현상. 원인: `LineCursor.next()` 의 race 에서 진 `setTimeout` 을 `clearTimeout` 하지 않아 이벤트 루프가 계속 붙잡힘 — 두 지점(라인 읽기 타임아웃, 프로세스 종료 대기)의 타이머를 전부 명시적으로 clear 하도록 수정. 표준 CLI 종료 시간 30.016s → 0.05s 로 실측 확인.
- 검증: 1102/1102 pass · typecheck OK · 실제 어댑터 왕복 + hang 재현/해소 수동 검증.

### Added — V3.38 글로벌 온보딩 1단계 — 영어 README + 데모 GIF + CFGM_LANG (2026-07-25)
- **영어 README 전환** — `README.md` 영어 본문 (한국어판은 `README.ko.md` 보존, 상호 링크). 최상단에 "Memory rot, measured" 후크 (코호트 부패 곡선 mermaid + 기각 로그 공개 카피). 모든 캡처는 실제 실행 출력만 사용 — 초안의 번역 캡처를 실캡처로 전량 교체, 한국어 원문 발췌는 translation 라벨 병기 (팩트체크 원칙).
- **`CFGM_LANG=en`** — 데모 경로 CLI 4종(doctor/search/ask/stats) 영어 출력 모드 (`src/core/i18n/messages.ts`). 기본값 ko 는 기존 출력과 동일 (회귀 가드 테스트). --json 구조 불변. 테스트 5건.
- **30초 데모 GIF** (`docs/assets/demo.gif`, vhs 녹화 + `demo.tape` 재현 스크립트) — search → ask (claim 인용 지시 + 토큰 10.7% 푸터) → stats (96.8% 절감). README 최상단 삽입.

### Added — V3.37 Session Consolidation — 구현 + 실측 기각 (2026-07-24, 정직 보고)
- **`SessionConsolidator`** (신규) — 근사중복 supersede (content-token TF 코사인 ≥0.90) + 추출적 증류 (상위 5문장/30% 고정). 계측기 교정 선행: HashedNgram 원문 코사인은 무관 쌍 23.2%≥0.90 로 무효 판정 → content-token TF 로 교체 (무관 max 0.314 / 근사중복 min 0.940, 벤치 정답 미사용). `cfgm rot-bench --consolidated` 3조건 측정.
- **M 코호트 실측 판정 — 기각**:
  - **증류 기각**: consolidated R@5 57.8~65.6% — governed 대비 **-25pp**. 5문장 증류가 recall 신호를 파괴 (토큰은 13배 절감되나 검색 품질 손실이 압도). 고정 예산 추출 증류는 장세션 검색에 부적합.
  - **dedup 은 안전하나 불발**: 정답 세션 오폭 **0건**, 그러나 supersede 발동도 475세션 중 평균 2.6건 — **LME 의 부패는 중복이 아니라 무관 세션 crowding** 이라는 진단 확보. dedup supersede 는 재진술형 실사용 부패용 seam 으로 보존 (벤치로는 미입증 상태 명시).
  - 파라미터 구제 스윕 없이 단일 실행 기각 — 튜닝 로그 원칙 준수. 코드는 production seam 으로 유지.
- 전략 함의: LME-M 은 usage 신호(회상 빈도·claim supersede 링크)가 없는 최악 조건 측정 — memory-brain 의 decay/승격이 쓰는 실사용 신호는 이 벤치로 검증 불가. 다음 방향은 crowding 대응 판별력 (사전 등록 후 측정) 또는 실사용 신호 기반 시뮬레이션.

### Added — V3.36.2 코호트 분석 — 순수 부패 곡선 확정 (2026-07-24)
- **`cfgm rot-bench --cohort`** — 4개 체크포인트 전부 평가 가능한 공통 문항만 포함 (M: n=64, 제외 436). 전 지점 n 동일 불변식 가드. 리포트 별도 파일 (`rot-bench-cohort-latest.md`).
- **M 코호트 실측 (동일 문항, 혼동 제거)**:
  - **부패 실증**: 축적 25%→100% 에서 naive R@5 92.2→79.7% (**-12.5pp**), governed 96.9→82.8% (**-14.1pp**) — 세션 축적에 따른 검색 부패는 실재하며 가파름. 분야의 "열린 문제"가 자체 측정으로 확인됨.
  - **정직 판정**: governed 는 전 지점 R@5 우위 (+1.6~+4.7pp) 이나 **기울기는 naive 보다 완만하지 않음** — 격차가 축적에 따라 축소되고 MRR 은 100% 시점 동률 (0.720 vs 0.722). **"축적에 강건한 메모리" 주장 불가 — README 게재 보류 유지.**
  - 전략적 의미: 철학의 전제(부패 실재)는 입증, 해법(현행 governed retrieval)은 미완 — 격차 자체가 다음 개발 목표이며 측정 장치는 확보됨.

### Added — V3.36.1 LongMemEval_M 실측 + 스트리밍 파서 (2026-07-24)
- **스트리밍 JSON 파서** (`src/core/bench/StreamingJson.ts`) — 2.5GB 데이터셋에서 `.text()` JS 문자열 상한 초과로 SIGTRAP 크래시하던 문제 해결. top-level 배열 원소를 chunk 단위 상태 기계로 1건씩 parse·평가·폐기 (메모리 ~문항 1건분). `--sample` 은 스트림 조기 종료. S/M 단일 경로. 테스트 8건 (chunk 경계 멀티바이트 포함).
- **M (문항당 ~500세션, 2.5GB, SHA-256 기록) 500문항 실측 (7.4분, LLM 0회)**:
  - **규모 저하 실재**: 동일 지표 기준 S(~50세션) 대비 M 100% 시점 R@5 97.4→88.8% (naive) / 98.0→89.4% (governed) — 축적 규모 10배에서 검색 품질 저하 확인.
  - **governed 전 지점 우위**: R@5/MRR 모두 4개 체크포인트 전부 naive 이상. 격차는 이른 축적 구간에서 최대 (25%: +4.7pp R@5 / +0.055 MRR), 100% 시점 +0.6pp / +0.025.
  - **정직 한계**: governed 도 규모에 따라 저하 — "부패하지 않는다"는 주장은 여전히 불가. 체크포인트 간 곡선 비교는 평가 문항 부분집합이 달라(n 64→500) 코호트 혼동 요인 있음 — 4개 체크포인트 공통 문항 코호트 분석이 후속 개선.

### Added — V3.36 Memory Rot Benchmark — 측정 도구 + 정직 판정 (2026-07-24)
- **`cfgm rot-bench`** (`src/core/bench/RotBench.ts`) — 세션 축적 강건성 실측: 날짜순 체크포인트(25/50/75/100%) × 2조건 (naive hybrid vs governed V3.32 확정 구성). LLM 0회, LongMemEval.ts 무수정(추가 전용), 테스트 신규 포함 45/45.
- **500문항 실측 판정 (정직 보고)**: "축적에 따른 부패 곡선"은 **이 측정에서는 입증되지 않음** — 양 조건 모두 질문 단위 R@5 hit 97~99% (천장 효과), naive 붕괴 없음. 유일한 유의미 격차는 temporal-reasoning 100% 시점 governed +2.3pp (98.5 vs 96.2%). governed 는 전 지점에서 naive 이상 (하한 보장).
- 원인: LME_S haystack ~50세션은 부패 발생 규모 미달 + 이진 hit 지표의 관대함. 리포트에 한계 자진 명시 (`memory/reports/rot-bench-latest.md`).
- 후속 후보: LongMemEval_M (문항당 ~500세션) 로 실제 대규모 축적 측정 — README 에 "썩지 않는 메모리" 주장은 **실증 전까지 게재하지 않음**.

### Added — V3.35 철학 완성 3축: 자동 capture · wiki 망각 · 토큰 효율 가시화 (2026-07-24)
- **자동 capture** — session-end hook 이 세션 관찰 기록(기본 3건 이상)을 `<storageRoot>/_pending/capture/` 에 자동 enqueue. `CaptureEnqueuer` 모듈 추출로 CLI/hook 공유. kill switch `CFGM_AUTO_CAPTURE=0`, 임계값 `CFGM_AUTO_CAPTURE_MIN`. **hook 내부 오류는 세션 종료에 영향 0** (오류 주입 테스트로 검증). `capture-status` 는 repo+storage 큐 동시 집계, `capture-accept --drafts-dir` 신설.
- **`cfgm decay`** — L3 wiki 망각. `WikiDecayEngine`: 페이지 나이(updated_at) × 회상 빈도(UsageLog.pageStats) → fresh/aging/stale-draft/decay-candidate 4단 판정, 모든 판정에 사유 명시. 기본 dry-run + `memory/reports/decay-latest.md` 리포트. 조치는 `--archive <pageId>` 페이지 단위 명시 승인만 — **삭제 코드 경로 없음** (archive 이동 + `status: archived`). 첫 실측: 실제 wiki 5건 중 stale-draft 1건 검출.
- **토큰 효율 가시화** — `TokenEstimate` (chars/4, 추정치 명시). `cfgm ask` 푸터에 "근거 번들 ~N tokens · 전체 메모리의 P%" (실측: 180 tokens / 4.6%), stats·viewer 에 전량 주입 대비 절감률. 공책 모델(라우팅 철학)의 이득을 처음으로 수치화.
- 검증: **1047/1047 pass** (신규 34) · typecheck OK · 실사용 스모크 (decay 실판정·ask 토큰 표기·stats 집계) 통과.

### Changed — README 예시 중심 재구성 (2026-07-24)
- 최상단에 "30초 데모" (Before/After 실캡처 — `cfgm ask` 근거 번들 + claim pointer 인용 답변) + "시나리오 3" 신설: ① 세션 간 결정 기억 ② claim 단위 근거 역추적 ③ **markdown·git 기반 메모리** (블랙박스 DB 대비 — 열람·수정·diff·롤백·PR 공유).
- 모든 예시는 실제 실행 캡처만 사용 (팩트체크 원칙). 벤치마크 카드 수치 무변경 (위치만 데모 아래로), "핵심 기능" → "고급 기능" 격하, 4 페인포인트에 구체 장면 서술 추가.

### Added — V3.34 효용 3종 — `cfgm ask` · `cfgm capture` · 사용 통계 (2026-07-24)
- **`cfgm ask "<질의>"`** (`bin/cfgm-ask.ts`) — evidence pointer 붙은 근거 번들 컴포저. hybrid 검색 top-K + hit 페이지의 `<!-- claim:... -->` 마커 추출 + host LLM 인용 지시 (추측 금지·pointer 의무). LLM 직접 호출 0 (원칙 2). claim-grounded 정체성을 CLI 한 줄로 체감. 테스트 5건.
- **`cfgm capture` 파이프라인** (`bin/cfgm-capture{,-status,-accept}.ts` + `memory/_pending/capture/`) — 세션 노트/transcript → wiki page draft 수집 큐. 검증된 normalize PAI 큐 패턴 복제 (SHA stale 체크·job.md·host-위임 spec). draft 는 confidence 의무 + 중복 시 supersede 명시, `capture-accept` 로 사용자 검토 후 편입 (path traversal 방어, `--force` 시 `_archive/` 보관). 쓰기 경로 수동 병목 해소의 1단계. 테스트 6건.
- **로컬 사용 통계** (`src/core/stats/UsageLog.ts` + `bin/cfgm-stats.ts` + viewer 패널) — search/ask 사용 이력을 storage root 아래 append-only jsonl 로만 기록 (외부 전송 코드 0). `cfgm stats` 터미널 요약 + `cfgm-viewer` `/api/stats` + "사용 통계" 패널 (주간 횟수·top 질의·top 페이지·일별 추이). 효능 가시화 장치. 테스트 9건.
- 수정: `cfgm-ask` claim 추출 경로가 storage root 를 repo 루트로 오인하던 결함 — 실사용 스모크 테스트에서 발견, rebuild-index 와 동일한 `CFGM_PROJECT_ROOT ?? cwd` 규칙으로 통일.
- 검증: 1013/1013 pass (신규 20) · typecheck OK · 실사용 스모크 (ask claim 추출·capture enqueue/status·stats 집계) 통과.

### Added — V3.33 온보딩 — `cfgm search` + Codex(AGENTS.md) 지원 (2026-07-23)
- **`cfgm search "<질의>"`** (`bin/cfgm-search.ts`) — wiki 자연어 검색 CLI 신설. 설치 직후 효능 체감용 진입점 부재를 메움 (`graph-query` 는 KG 전용, plain wiki 검색이 없었음). 인덱스 미생성 시 안내 후 exit 1. 테스트 4건.
- **`AGENTS.md`** (저장소 루트 신설) — Codex CLI 등 non-Claude host 용 bootloader. `CLAUDE.md` 와 동일한 메모리 규칙 + 30초 온보딩 커맨드. 이전에는 Codex 대응 진입점이 전무했음.
- README Quick Start: `cfgm search` 스텝 추가 (60초 온보딩 완성) + Claude Code/Codex 동시 지원 안내.
- `retrieveTopSessions` (V3.32 QA enqueue 단일 진입점, `bin/cfgm-lme-enqueue.ts` 리팩터)가 미커밋 상태로 남아있던 것을 발견해 커밋 — README 발표 벤치마크 수치의 재현성 보장.
- 검증: 993/993 pass · typecheck OK.

### Added — V3.32 QA v2 재실측 (2026-07-22, held-out test 255)
- Sonnet 위임 재실행 (PRF retrieval + prompt v2). 동일 test split 공정 비교: **QA accuracy 87.1% → 89.0%** (+1.9pp)
- **temporal-reasoning 87.5% → 93.1%** (+5.6pp — prompt v2 날짜 산술 지침 효과 입증) · multi-session 77.8→79.2% · knowledge-update/user/assistant 동일 유지
- preference 58.3% 동일 (n=12 소표본 — 통계적 판단 유보, BENCHMARK.md 한계 명시)
- v1 대비 판정 조건 동일 (같은 judge 프로토콜·같은 split) — 리포트 `memory/reports/longmemeval-qa.md`

### Added — V3.32 벤치마크 공신력 + PRF retrieval 개선 (2026-07-22)
- **Held-out split** — `splitOf(question_id)` FNV 해시 분할 (dev 245 / test 255). 튜닝은 dev 전용, test 는 1회 확증. `--split dev|test` CLI 플래그. 리포트에 config 문자열 기록
- **PRF 쿼리 확장 (채택)** — 1차 top-3 세션에서 TF 상위 확장 어휘 추출 → top-3 고정 + rank 4+ 꼬리 RRF 재정렬. 벤치 특화 상수 없는 표준 IR 기법. dev R@5 92.8→**94.3%** (preference +11.1pp), **test 확증 93.2%**, 전체 500 R@5 92.2→**93.7%** (multi-session 88.7→91.5, preference 80.0→86.7 회복)
- **Turn-level granularity (측정 후 기각)** — dev R@5 -3.1pp 퇴행. `--granularity turn` 옵션은 남기되 기본 미사용, 튜닝 로그에 기각 사유 기록 (정직 보고)
- **답변 prompt v2** — 유형별 지침 (multi-session 전 세션 열거 후 종합 / temporal 날짜 산술 명시 / knowledge-update 최신값 / preference 사용자 명시 정보 인용). QA 86.2% vs retrieval 상한 96.5% 의 생성 손실 겨냥. 재실행 대기
- **`docs/BENCHMARK.md`** — 팩트체크 규약: 데이터셋 SHA-256, split 정책, 튜닝 로그 (기각 포함), judge 프로토콜, 재현 커맨드, 타사 비교 규칙, threats to validity

### Added — V3.31 사용성·설치·확장성 (2026-07-22)
- **통합 CLI `cfgm`** (`bin/cfgm.ts`) — 52개 개별 스크립트의 단일 진입점. `cfgm help` (그룹별 목록), `cfgm <command> [args]` dispatch, 미등록 이름도 `bin/cfgm-<name>.ts` 존재 시 실행 (registry 누락 무해). package.json `bin` 필드 → `bun link` 로 전역 `cfgm` 등록
- **`cfgm doctor`** — 설치·환경 자가진단: Bun 버전 · 의존성 · memory/ 레이아웃 · 인덱스 존재/신선도 (WAL mtime 보정) · SSL 큐 stale · Brain 프로파일 · LME 데이터. 실패 항목마다 실행 가능한 조치 명령 제시
- **`docs/EXTENDING.md`** — 확장 계약 8종 문서화 (Embedder 주입 · fusion 전략 · dateWindow · Router 매핑 · SSL 어휘 · OKF · host-위임 큐 패턴 · 벤치 케이스)
- **README Quick Start 개편** — deprecated `bin/install.ts` 안내 제거, `cfgm doctor` 중심 온보딩

### Fixed — V3.31
- doctor 인덱스 경로가 `resolveStorageRoot()` 와 불일치하던 문제 (rebuild 는 `~/.claude-brain/...` 에 쓰는데 진단은 repo 로컬을 봄) — 동일 해석 사용
- WAL 모드에서 인덱스 신선도가 본 파일 mtime 만 보고 오판하던 문제 — `-wal`/`-shm` 포함 최신 mtime 사용

### Added — V3.30 LongMemEval Retrieval Tuning (2026-07-22, 워크플로우 진단 기반)
6-agent 워크플로우 (유형별 miss 진단 3 + 독립 설계 2 + 합성 1) 가 R@3 실패 29건에서 도출한 설계를 P1→P4 단계별 격리 측정으로 구현:
- **P1 Content 쿼리** — `toContentFtsQuery`: 영어 폐쇄류 stopword + 상대시간 어휘 제거 + 경량 스테밍 (`trips* OR trip*`). `queryFtsWithFallback` 3단 체인 (raw → content → loose). 일반동사 (like/want/need) 는 preference 내용어라 보존 (실측 근거 주석)
- **P2 rescue-rerank fusion** — top-3 고정 (R@1 무퇴행 불변식) + FTS rank 4+ 꼬리만 벡터 RRF 재정렬. opt-in (`fusion: "rescue-rerank"`), 기본값은 rescue 유지
- **P3 Temporal** — `TemporalQuery.ts` (결정론 상대시간 파서: "N weeks ago" / "last Saturday" / "past three months" → epoch day 창, "last name" 오탐 차단) + schema v5 (`wiki_dates` 테이블, `body_user` 컬럼, **마이그레이션 가드**: 버전 불일치 시 derived 테이블 drop&recreate) + `dateWindow` soft filter (창 안 문서 stable-partition 승격) + 요일 전체명 병기 + abstention 분리 집계
- **P4 user-turn 가중** — `WikiPage.bodyUser?` + bm25 명시 가중 (BODY_USER_WEIGHT 2.0, ablation 1.0/2.0/3.0 실측으로 결정). 빈 bodyUser 는 기존 랭킹과 수학적 동치 (회귀 테스트 고정)
- **실측 (LongMemEval_S 500, hybrid)**: R@1 55.2→**56.6%** · R@3 85.9→**87.2%** · R@5 91.7→**92.2%** · R@10 94.5→**96.2%** · MRR 0.909→**0.927**. temporal MRR 0.867→**0.927** (목표 0.91+ 달성) · multi-session 86.6→88.7% · knowledge-update 98.1% 유지
- **알려진 퇴행 (정직 보고)**: single-session-preference R@5 86.7→80.0% / MRR 0.630→0.561 (n=30). 원인: content 쿼리가 preference 질문에서 우연히 도움되던 stopword 매칭을 제거. hypernym 사전으로 회복 가능하나 벤치 과적합 위험으로 의도적 제외 (설계 합성 판정) — held-out split 도입 후 재시도 권고

### Added — V3.29 External Benchmarks: LongMemEval (2026-07-21)
- **① Retrieval-only 트랙** (LLM 호출 0)
  - `LongMemEval` 어댑터 (`src/core/bench/LongMemEval.ts`) — 질문별 haystack 세션 인덱싱 → `answer_session_ids` 대비 session-level Recall@K + MRR (논문 §4.2 프로토콜). fts/hybrid 비교, question type 별 분해, haystack 중복 세션 id dedupe
  - `cfgm-lme-retrieval` CLI (`bun run bench:lme`) → `memory/reports/longmemeval-retrieval.md`
  - **첫 실측 (LongMemEval_S 500문항)**: R@1 55.2% · R@3 85.9% · **R@5 91.7% · R@10 94.5% · MRR 0.909** (89초, LLM 0회)
- **② 풀 QA 트랙 실측 (2026-07-22)**: Sonnet 위임 실행으로 500/500 답변 + LLM judge 500 판정 → **공식 QA accuracy 86.2%** (retrieval R@10 96.2% 가 상한). type 별: assistant 100% / user 98.6% / knowledge-update 93.6% / temporal 88.0% / multi-session 77.4% / preference 43.3% (retrieval 약점 전파)
- **② 풀 QA 트랙** (host-위임 — 원칙 2 준수)
  - `LmeQa` (`src/core/bench/LmeQa.ts`) — answer job (ground truth 미포함, 누출 방지) / judge job (truth 포함) / SQuAD-style token-F1 proxy / judge accuracy 집계
  - `cfgm-lme-enqueue` (retrieval top-k 컨텍스트 포함 job 생성) + `cfgm-lme-score` (proxy 채점 · `--judge-enqueue` · `--collect`)
  - PAI 세션 처리 전제 (원칙 5). `memory/_pending/lme/` 는 gitignore (재생성 가능 대용량)
- **③ Skill retrieval 트랙** — 데이터 소스 확정 (benchflow-ai/skillsbench: 87 tasks + 229 matched skills). 구현은 다음 사이클

### Changed — V3.29
- **Hybrid fusion 기본 전략 rrf → rescue**: LongMemEval 실측에서 동등 RRF 가 긴 세션 문서 코퍼스의 R@1 을 96%→64% 로 퇴행시키는 것을 확인. rescue (FTS 랭킹 보존 + 벡터는 FTS 미발견 문서만 뒤에 보충) 로 전환 — LongMemEval R@1 96% 유지 + wiki 마이크로벤치 구제 효과 (37.5%→100%) 유지 + skills MRR 1.000. `fusion: "rrf"` 옵션으로 기존 동작 선택 가능
- `SearchIndex` vectors insert → `INSERT OR REPLACE` (외부 데이터셋 중복 doc id 방어)

### Added — V3.28 Frontier Gap Closure (2026-07-21)
- **OKF 호환 export** — Google OKF (Open Knowledge Format) v0.1 번들 어댑터
  - `OkfExporter` (`src/core/okf/OkfExporter.ts`) — L3 wiki page → OKF concept 문서 (`type` 필수 + title/description/resource/tags/timestamp 정렬, `x_cfgm_*` provenance 보존, `[[id]]` → 상대 링크 변환)
  - `cfgm-okf-export` CLI (`bun run okf:export`) — dir index + root index 포함 번들 생성 (기본 `dist/okf`)
  - 코어 재구조화 없음 — wiki 스키마가 truth, OKF 는 어댑터 경계 뒤 파생물
- **Hybrid 검색 (opt-in)** — FTS5 BM25 + 벡터 cosine 랭킹 RRF 융합
  - `Embedder` 인터페이스 + `HashedNgramEmbedder` (의존성 0, 결정론적 char n-gram — 원칙 2 준수, API key 불요. 실제 embedding 모델은 인터페이스 구현으로 주입 가능)
  - `SearchIndex` schema v3→v4: `vectors` 테이블 + `searchWikiHybrid` / `searchSkillsHybrid` (벡터 없으면 FTS fallback — back-compat)
  - `cfgm-rebuild-index --embeddings` opt-in 플래그
- **Memory quality benchmark** — 코드 정확성과 별개로 메모리 품질을 정량 측정
  - `BenchRunner` — router lane 적중률 (hit rate + macro P/R) + wiki/skill 검색 recall@1/3/5 + MRR (fts vs hybrid 비교)
  - `fixtures/bench/cases.json` — 한/영 혼합 + 오타 케이스 30건, `cfgm-bench` CLI (`bun run bench`) → `memory/reports/benchmark-latest.md`
  - 첫 실측 (wiki 5 pages / skills 12): router lane hit 87.5% · wiki recall@5 fts 37.5% → **hybrid 100%** · MRR 0.375 → 0.938
- **Pending queue 실패 시맨틱** — orphan job 회수 계약
  - `JobLifecycle` (`src/core/normalizer/JobLifecycle.ts`) — claim (attempts+1 + `lease_expires_at`) / reap (lease 만료 → pending 재큐 또는 max_attempts 도달 시 failed) / 수동 requeue. legacy job 은 mtime+TTL 판정 (back-compat)
  - `cfgm-ssl-reap` CLI (`bun run reap`) — `--dry-run` / `--ttl-minutes` / `--max-attempts`
  - `cfgm-ssl-enqueue` 신규 job frontmatter 에 `attempts` / `max_attempts` 추가, `cfgm-ssl-status` 에 stale 카운트 + reap 권고 표시
  - `_spec/prompt.md` — PAI 세션 claim 프로토콜 + 재시도 계약 명세

### Fixed
- `SearchIndex.searchWiki` / `searchClaims` — 하이픈/콜론 포함 실사용 쿼리 ("KG-Brain", "bun:sqlite") 가 FTS5 구문 오류로 크래시하던 문제. raw MATCH 실패 시 sanitize 재시도 폴백 (첫 벤치마크 실행이 발견한 실 버그)

## [0.3.9] — 2026-05-08

### Added
- **V3.24 Executable SSL** — SSL JSON이 실행 프로그램을 겸하도록 확장
  - `LogicalNode.instructions?: string` — 자연어 실행 지시 슬롯 (optional, back-compat)
  - `SSLRunner` (`src/core/runner/SSLRunner.ts`) — BFS topological sort → `Step[]` 생성. CollectStep / BranchStep / ExecuteStep 세 종류. 병렬 실행 감지 (resourceTarget conflict) + 사이클 감지
  - `cfgm-run` CLI (`bin/cfgm-run.ts`) — plan-generator (기본) / `--interactive` / `--json` 세 모드. 슬러그 regex 검증 (path traversal 방어) + `validateSSL` 게이트
  - `app-store-screenshots.json` — 7개 logical 노드에 instructions 채움 (최초 완전 실행 가능 SSL JSON)
  - `bun run run:skill --skill <slug>` 단축 명령

### Fixed
- `LogicalNode.description`, `evidenceClaimIds`, `InteractionNode.variables` → optional (실제 JSON 아티팩트와 타입 계약 일치)
- `isParallelSafe`: resourceTarget 없는 노드 → `parallel: false` (unknown = unsafe)
- `SearchIndex`: `l.description ?? ""` (undefined 오염 방지)

## [0.3.8] — 2026-05-06

### Added
- **TBox 확장** — `_canonical/capabilities.yaml` + `_canonical/scopes.yaml`
  - `capabilities.yaml`: action 범주 6종 (FILE_IO / MEMORY_PROCESSING / SCRIPT_EXECUTION / ORCHESTRATION / USER_INTERACTION / CONDITIONAL_BRANCHING). SSL Logical.actionRef → skill 능력 범주 매핑
  - `scopes.yaml`: resourceScope 위험 범주 5종 (EPHEMERAL / PERSISTENT_LOCAL / EXTERNAL / SENSITIVE / ASYNC). SSLRiskDetector 분류와 일관
  - IS-A 추론 없음 — yaml 어휘 정의만. 코드 변경 없이 확장 가능

- **`cfgm-find-chain --replay`** — goal → chain 발견 → replay plan 즉시 생성
  - `--replay` 플래그: top-1 chain 의 rootSlug 로 `buildChainReplayPlan` 즉시 실행
  - 출력: `memory/_pending/replay/<root>-chain.replay.md`
  - find-chain + replay 두 단계를 한 명령으로 완결

- **PAI spec 갱신** (`memory/_pending/normalize/_spec/prompt.md`)
  - 버전 표기 0.2.0 → 0.3.0
  - DecisionNode / InteractionNode / EvidenceNode / ProtocolNode 세부 필드 채우기 지침 추가 (branches[]{when,then}, expectedResponseType, successCriteria[], delegateTo 등)
  - TBox 파일 참조 안내 추가 (capabilities.yaml, scopes.yaml)

## [0.3.7] — 2026-05-06

### Added
- **V3.23 `KGChainFinder` + `cfgm-find-chain`** — goal-driven skill 체인 발견
  - `KGChainFinder.findChains(goal, opts)` — FTS5 `ssl_skills` 검색 → KGComposer COMPOSES 트리플로 체인 구성. 5단계 알고리즘:
    1. FTS5 prefix 검색 → hit slugs + BM25 score
    2. reverse-COMPOSES 인덱스 빌드
    3. 히트 slug에서 체인 root 후보 추출 (상위 전파)
    4. 각 root 에서 full chain 구성 + 히트 score 합산
    5. totalHitScore desc 정렬 → top N 반환
  - `bin/cfgm-find-chain.ts` — `--goal "..."` + `--top N` + `--json`
  - `bun run find-chain --goal "..."` 단축 명령
  - 8/8 테스트, coverage 100%

### Design
- 검색(FTS5) + 추론(KGComposer) + 체인(KG) 세 레이어를 최초로 수직 통합한 쿼리 경로
- ssl_skills 미초기화 시 빈 결과 반환 (예외 없음, graceful degradation)
- BM25 가중치는 SearchIndex와 동일 (scheduling=3.0, structural=1.5, logical=1.0)

## [0.3.6] — 2026-05-06

### Added
- **V3.22 `KGSharedNodeDetector` + `cfgm-dedup-actions`** — 체인 내 중복 actionRef 탐지
  - `KGSharedNodeDetector.detect()` — INSTANTIATES 엣지 기반으로 2+ skill이 공유하는 canonical actionRef 그룹화
  - `inChain=true`: COMPOSES 관계 내 중복 (체인 실행 시 같은 작업 반복) — 제거 후보
  - `inChain=false`: 독립 skill 간 어휘 공유 — 참고용
  - `bin/cfgm-dedup-actions.ts` — `--json` / `--chain-only` 지원
  - 8/8 테스트, coverage 100%

### Design
- KGComposer를 내부에서 실행해 COMPOSES 인덱스를 빌드 후 pair-wise 체인 관계 확인
- 탐지 결과를 수정하지 않음 — 보고만. 실제 dedup은 사용자/PAI 세션 판단

## [0.3.5] — 2026-05-06

### Added
- **V3.21 `cfgm-replay --chain`** — BFS 체인 순회 → 계층적 replay plan
  - `buildChainReplayPlan(rootSlug, sslDir, db)` — KGComposer COMPOSES 트리플로 루트 skill의 위임 체인을 BFS 탐색, 각 skill 의 replay 섹션을 깊이 순으로 결합
  - 출력: `memory/_pending/replay/<slug>-chain.replay.md` — frontmatter에 `chain_mode: true`, `chain_skills: [...]` 포함
  - `## Execution Order` 섹션: 깊이별 인덴트 + `← delegated by` 표기
  - `--chain` 플래그 추가 (`--slug`/`--query` 와 결합 사용)
  - `import.meta.main` 가드 추가 — 테스트 import 시 CLI 코드 미실행
  - 7/7 테스트

### Design
- COMPOSES 트리플(V3.20)을 직접 소비하는 첫 consumer — transitive closure가 실용적 가치를 입증
- 단일 skill replay 기존 동작 100% 유지 (회귀 0건)

## [0.3.4] — 2026-05-06

### Added
- **V3.20 R-COMPOSE inference (`KGComposer` + `cfgm-compose`)**
  - `KGComposer` — read-only inference engine on kg_edges. Computes:
    1. Transitive closure: A COMPOSES B if A →...→ B via DELEGATES_TO (depth ≤ 10, WITH RECURSIVE CTE)
    2. Cycle detection: paths where A →...→ A; deduplicated by canonical rotation (smallest slug first)
  - `bin/cfgm-compose.ts` — CLI with `--json` / `--no-report` / `--output` flags
  - Writes `memory/reports/skill-cycles.md` when cycles are detected
  - 13/13 tests, coverage 100%

### Design
- KGComposer operates read-only; does not mutate kg_edges — COMPOSES triples are always recomputed on demand
- Diamond deduplication: A→B, A→C, B→D, C→D produces exactly one A COMPOSES D triple (UNION not UNION ALL in CTE)
- Cycle canonical form: ring rotated so smallest slug appears first → same cycle from any starting node maps to one entry
- `bun run compose` shortcut added to package.json

## [0.3.3] — 2026-05-06

### Added
- **V3.19 Cross-skill 엣지 물질화 (KG-Brain 전역 그래프 인프라)**
  - `KGProjector` — SSLDocument를 typed KG 노드/엣지로 추출. CONTAINS/TRANSITIONS_TO/INSTANTIATES/DELEGATES_TO/SCOPED_TO 5종 relation 물질화
  - `KGGraph` — SQLite 기반 그래프 쿼리 API: `neighbors()` / `reverseDelegators()` / `reachable()` (재귀 CTE) / `danglingEdges()` / `stats()`
  - `cfgm-graph-query` CLI — 6개 subcommand: `neighbors` / `reverse-delegators` / `reachable` / `dangling` / `stats` / `node` / `skill-nodes`
  - `SearchIndex` SCHEMA_VERSION 2→3: `kg_nodes` + `kg_edges` 테이블 추가 (역방향 인덱스 포함)
  - `Indexer.rebuild()` — KGProjector 통합. rebuild 결과에 nodeCount/edgeCount/danglingEdgeCount 추가

### Design
- ProtocolNode.delegateTo가 처음으로 타입 엣지(DELEGATES_TO)로 물질화됨 — cross-skill 그래프 완성의 핵심 단계
- 같은 search.sqlite에 kg_nodes/kg_edges 추가 (별도 DB 없음) — FTS5↔graph 혼합 쿼리 가능
- 2-phase rebuild: 전체 노드 등록 → cross-skill resolve → bulk insert (부분 rebuild 없음, V1 full-only)
- canonical_action 가상 노드화: `neighbors("canonical_action:READ_LOCAL_FILE", dir=in)` → 해당 action 쓰는 모든 logical 노드

## [0.3.2] — 2026-05-06

### Added
- **Workflow Capture (`cfgm-learn`)** — "학습해라" 진입점. 사용자 기술 → `memory/workflows/<slug>.md` (SKILL.md 포맷) 생성 + SSL normalize enqueue. `bun run learn --name <slug> --goal "..."` 로 호출
- **SSL-guided Replay (`cfgm-replay`)** — "수행해라" 진입점. SSL 그래프를 Scene DAG 순서로 순회 → `memory/_pending/replay/<slug>.replay.md` (host LLM 실행 계획) 생성. `--slug` / `--query` / `--list` 지원
- **Replay spec** (`memory/_pending/replay/_spec/replay-guide.md`) — host LLM 이 replay plan 을 단계별로 실행하는 자연어 명세 (action type → tool 매핑 포함)
- `package.json` scripts: `learn` / `replay` / `enqueue` 단축 명령 추가

### Design
- V3.18 당초 "ExecutionBindingNode" 스키마 신설 방안 → **불채택**. 기존 SSL 그래프(StructuralNode.transitionsTo + containsLogicalIds + Decision/Interaction/Protocol 노드)가 이미 충분한 실행 구조를 보유. 스키마 변경 없이 CLI 2개로 해결
- SKILL.md 단독 대비 SSL replay 이점: 실행 순서 명시 / 분기 조건 명시 / 사용자 pause 명시 / 성공 기준 명시 / 위임 규약 명시

## [0.3.1] — 2026-05-06

### Added
- **V3.5 claim ledger 이관** — `memory/claims/ledger.jsonl` (git-tracked). 이전: `.memory-brain/claims/` (gitignored)
- `resolveProjectRoot()` + `buildClaimStorage()` — bootstrap 헬퍼, bin 7개 적용
- README quickstart 보강 — SSL normalize 흐름, CLI 참조표, Prerequisites
- CHANGELOG 초판

## [0.3.0] — 2026-05-06

### Added
- **Seed 9 canonical store** — `BRANCH_ON_LOCAL_FILE` + `READ_FROM_MEMORY` 2 신규 시드
- Canonical actionRef 사용률 **87.2% → 96%** (120/125 logical 노드)

## [0.2.0] — 2026-05-05

### Added
- **SSL 0.3.0 schema** — 4 신규 노드: DecisionNode / InteractionNode / EvidenceNode / ProtocolNode
- **Canonical Action Store** (`_canonical/actions.yaml`) — 시드 7: INFER/EMIT/BRANCH/TRANSFORM/READ/WRITE/CALL_LOCAL_SCRIPT
- **CanonicalCandidatesDetector** — inline 패턴 N≥3 자동 발견 (governance 6번째 detector)
- **KG-Brain Dashboard** (`cfgm-ssl-viewer`) — Bun.serve() + 5 API endpoint, XSS-safe DOM
- **PAI prompt spec** (`memory/_pending/normalize/_spec/`) — vendor-agnostic host-delegated normalize
- **`cfgm-ssl-stats`** — V3.17 효과 측정 CLI
- **SSL skill discovery** (`SearchIndex.searchSkills`) — FTS5 bm25 가중치 rich-field retrieval (논문 §4.1)
- **SSL risk gate** (`SSLRiskDetector`) — rule-based risk classifier, governance 통합
- **File-based pending normalize queue** — job.md + heuristic sidecar, host LLM 위임
- **`cfgm-ssl-normalize` / `cfgm-rebuild-index`** — end-to-end SSL normalize CLI

### Changed
- SSL_VERSION 0.1.0 → 0.2.0 → 0.3.0 (schema 풍부화: skillGoal, effects[], actionRef 등)
- `cfgm-rebuild-index` — SSLReader 통합, wiki+claim+SSL 단일 명령 인덱싱
- PR-V3.13 (Anthropic SDK 직접 호출) 회수 — `docs/RULES.md` 원칙 1·2 위반

## [0.1.0] — 2026-05-05

### Added
- **SSL 0.1.0 schema** — arXiv 2604.24026 기반 Scheduling–Structural–Logical 표현
- **`SkillNormalizer`** — heuristic md→SSL 1차 변환 (7/7 테스트)
- **`src/core/ontology/ssl.ts`** — closed vocabulary + `validateSSL`

## [0.0.x] — 2026-04-27 ~ 05-04

### Added
- 7-layer 아키텍처 확정 (Bootloader / Router / Wiki / Claim / Graph / Persona / Governance)
- MIT 라이선스 + 자체 PersonaStore (markdown+jsonl)
- memory/ 디렉토리 트리 + bootloader (`CLAUDE.md`, `memory/ROUTER.md`, `memory/current.md`)
- Platform Adapter → Core → Storage 3-layer 코드 구조
- Claim ledger, SearchIndex, GovernanceReporter, PersonaStore 초기 구현
- `cfgm-viewer` (전체 메모리 뷰어, http://localhost:4040)
