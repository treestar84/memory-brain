# memory/current.md — 현재 작업 컨텍스트 표면

> 비전 §4 답습. 본 파일은 **현재 진행 중인 작업의 1쪽 요약**.
> 사용자 또는 Claude 본체가 session-start / session-end 시점에 갱신.

## 운영 규칙

- **갱신 주기**: 의미 있는 진행 1건 이상 발생 시 1줄 추가 또는 섹션 갱신.
- **크기 상한**: ~100줄. 초과 시 `memory/journal/YYYY-MM-DD.md` 로 오래된 항목을 이관.
- **2026-07-26 이관**: PR-V3.2 ~ V3.31 구간의 전체 이력을 `memory/journal/2026-07-26.md` 로 이관 (형식 미준수 누적分 정리). 본 파일은 V3.32 이후 최근 작업만 유지.
- **형식 템플릿**: `memory/journal/2026-07-26.md` 상단에 원본 예시 보존.

## V3.32 벤치마크 공신력 + PRF (2026-07-22) ✅

- **held-out split** 도입 (dev 245 튜닝 / test 255 확증 1회) — 과적합 반박 장치. `docs/BENCHMARK.md` 에 전체 규약.
- **PRF 채택**: dev 92.8→94.3% → **test 확증 R@5 93.2%**. 전체 500: R@5 93.7% / R@10 96.5%. turn-level 은 측정 후 기각(-3.1pp, 로그 기록).
- **QA v2 재실측**: v1 87.1% → **v2 89.0%** (+1.9pp). temporal +5.6pp, multi-session +1.4pp.
- 남은 약점: multi-session QA(79.2%), preference(n=12 소표본).

## V3.33 온보딩 — `cfgm search` + Codex(AGENTS.md) 지원 (2026-07-23) ✅

- **`cfgm search "<질의>"`** — `searchWikiHybrid` 를 얇게 감싼 CLI. dogfood 메모리 덕에 클론 직후에도 결과 반환.
- **`AGENTS.md`** 신설 — Codex 등 non-Claude host 용 bootloader.
- 검증: 993/993 pass.

## V3.34 효용 3종 — ask · capture · 사용 통계 (2026-07-24) ✅

- 경쟁 도구(mem0/Zep/Letta) 대비 고도화 4축 제안 중 1(capture)·3(ask)·4(효능 지표) 승인, 2(점수 경쟁)는 철학 충돌 우려로 보류.
- **`cfgm ask`** — 근거 번들 컴포저 (claim 마커 추출 + 인용 지시, LLM 호출 0).
- **`cfgm capture`** — normalize PAI 큐 패턴 복제한 세션 기록→wiki draft 수집 큐.
- **사용 통계** — `UsageLog` (로컬 jsonl, 외부 전송 0) + `cfgm stats`.
- 검증: 1013/1013 pass.

## V3.35 철학 완성 3축 (2026-07-24) ✅

- 배경: 경쟁 전장 재조사(claude-mem 65.8K stars 등) 후 철학 7종 감정 — "90일차 페인 vs 1일차 채택" 격차 + 비가시성이 문제로 진단.
- **자동 capture**: session-end hook 자동 enqueue (임계 3건, kill switch, hook 오류 격리).
- **`cfgm decay`**: 나이×회상빈도 4단 판정. dry-run 기본, `--archive` 명시 승인만, 삭제 경로 없음.
- **토큰 효율 가시화**: ask 푸터 실측 "번들 180 tokens = 전체의 4.6%".
- 다음 후보로 rot 벤치마크 제안 → 승인 대기.

## V3.36~V3.37 Memory Rot Benchmark 사이클 (2026-07-24) ✅

- **V3.36**: `cfgm rot-bench` 구현. LME_S(~50세션)에선 부패 곡선 **미입증** (천장 효과) — 정직 보고.
- **V3.36.1**: LongMemEval_M(2.5GB) 실측 — SIGTRAP 크래시를 StreamingJson(chunk 상태 기계)로 해결. 규모 10배에서 저하 실재 (R@5 naive 97→89%대).
- **V3.36.2**: `--cohort` (동일 문항 n=64) — **부패 실재·가파름** (naive -12.5pp, governed -14.1pp, 25→100%). governed 전 지점 우위이나 기울기 우위는 없음 — "축적에 강건" 주장 불가.
- **V3.37**: SessionConsolidator(TF 코사인 dedup + 추출 증류) 구현·측정 → **기각**. 증류 -25pp(recall 파괴), dedup 은 오폭 0 이나 발동 희소(LME 부패는 중복이 아닌 crowding). 코드는 production seam 으로 보존.
- 함의: LME 는 usage 신호(회상빈도·supersede) 부재의 최악 조건 — decay/승격의 실사용 신호는 이 벤치로 검증 불가.

## V3.38 글로벌 온보딩 1단계 — 영어 README + 데모 GIF + CFGM_LANG (2026-07-25) ✅

- 배경: "경쟁 도구가 훨씬 많다, 개인 메모리로는 못 이긴다" 냉정 재진단 → claude-mem(65.8K★) 등 재조사 → GitHub 스타 로드맵 4단계 합의: ①영어 README+데모 ②rot-bench 독립화 ③Claude Code 플러그인 마켓플레이스 ④Show HN. npm 배포는 계속 최후순위 보류.
- README.md 영어 전환(README.ko.md 로 한국어판 보존) + "Memory rot, measured" 후크 섹션(코호트 곡선 mermaid + 기각 로그 공개).
- **`CFGM_LANG=en`** — 데모 경로 CLI 4종 영어 출력 모드(`src/core/i18n/messages.ts`), 기본 ko 불변.
- 30초 데모 GIF (vhs 녹화, `docs/assets/demo.tape`). 초안의 번역 캡처를 실캡처로 전량 교체(팩트체크 원칙).

## V3.39 rot-bench 독립화 — 외부 어댑터 프로토콜 (2026-07-26) ✅

- **subprocess JSONL 어댑터** (`RotAdapter.ts`) — 외부 메모리 도구를 naive/governed 와 동일 조건의 4번째 조건("external")으로 측정. `cfgm rot-bench --adapter "<command>"`.
- 참조 BM25 어댑터(`examples/rot-adapter-bm25.ts`) + `docs/ROT-BENCH.md`("당신의 메모리 도구를 측정해보라" 초대장).
- **근본 버그 수정**: 세션 중단(네트워크 오류) 후 재개 시 CLI 가 완료 후에도 최대 30초 안 끝나는 문제 발견 — 이전 세션의 `process.exit(0)` 우회를 걷어내고, 근본 원인(`LineCursor.next()` 의 `Promise.race` 에서 진 `setTimeout` 미해제)을 `clearTimeout` 으로 직접 수정. 30.016s → 0.05s.
- 검증: 1102/1102 pass.

## V3.40 Claude Code 플러그인 마켓플레이스 (2026-07-26) ✅

- 저장소 자체가 마켓플레이스 겸용(`.claude-plugin/`) — `/plugin marketplace add` → `/plugin install` 로 git clone 없는 설치 경로.
- 슬래시 커맨드 6종(`commands/*.md`): setup/search/ask/doctor/capture/stats.
- **보안 리뷰 시정 (커밋 직후 배경 리뷰 발견)**: 최초 구현은 `SessionStart` 훅이 승인 없이 `bun install && bun link` 자동 실행 — supply-chain-rce / silent-failure / silent-global-side-effect 3건 지적. **수정**: 훅은 읽기 전용 안내로 축소, 실제 설치는 `/memory-brain:setup` 이 Claude 의 정상 Bash 승인 흐름을 거쳐 사용자 동의 후 실행하도록 재설계.
- 검증: 1102/1102 pass.

## 다음 단계 후보

- **90일 rot 실사용 시뮬레이션**: 자동 capture + UsageLog 가 몇 주 누적되면 회상빈도·supersede 신호가 있는 실사용 기반 rot 측정 가능 (V3.37 이 남긴 한계의 해소 경로).
- **Show HN 런치**: 로드맵 4단계 — 제목 후보 "Memory rot is real: we measured it, and our own fix failed (data included)".
- **특허 후보 변리사 상담**: ① host-위임 파일 큐 패턴 ② 회상빈도 결합 망각+검토게이트 supersede — 공지예외 유예기간 소진 전 서두를 것.
- V3.25: cfgm-run `--interactive` 결과를 cfgm-replay 와 연동 (replay 파일 포맷 통일)
- V3.26: SSL instructions 자동 채우기 (PAI 세션에서 LLM이 SKILL.md → instructions 생성)
- V3.27: cfgm-run 다중 스킬 체인 실행 (cfgm-find-chain 결과를 순서대로 실행)
