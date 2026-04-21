# CFGM-OS v2 고도화 설계 토론

## 목표
이 레포(`/Users/treestar/dev/memory-brain`)의 CFGM-OS(Causal Flow Gap Memory OS)를
"PAI 정체성 기반 자가성장 메모리 엔진 v2"로 고도화한다.
Epic 0~6은 완료(411 tests pass). 본 토론의 산출물은 **고도화 설계 RFC + 단계별 구현 로드맵 + 배포 DX 설계**다.
구현은 하지 않는다. 합의된 설계 문서만 만든다.

## 절대 입력 컨텍스트 (반드시 먼저 읽고 시작)
- `docs/hook_memory_system_invention_prd_ko.md` — 원본 발명 PRD (전체)
- `docs/handoff.md` — Epic 0~6 완료 상태와 미해결 항목
- `docs/artifacts.md` — 모든 컴포넌트 인벤토리
- `docs/superpowers/specs/2026-04-17-cfgm-os-hook-memory-design.md`
- `docs/superpowers/specs/2026-04-19-cfgm-epic5-compaction-survival-design.md`
- `docs/adr/` 전체
- `flow-patterns/*.yaml` — 기존 흐름 템플릿
- `skills/cfgm-*` — 현재 스킬 자산
- `bin/install.ts`, `bin/uninstall.ts` — 현재 배포 흐름
- 비교 대상: `.omc/`, `.omx/` 디렉토리 — OMC/OMX의 설치·프로파일·HUD·doctor·setup 스킬 구조를 직접 살펴서 벤치마킹

## 사용자가 요구한 5가지 핵심 진화 축

1. **스킬 없이 워크플로우 지식 즉시 호출**
   - KG + 인과관계(Flow Block) 그래프 자체가 "암묵 스킬"로 작동해야 한다.
   - Skill 디렉토리 없이도 SessionStart/UserPromptSubmit에서 관련 micro-ontology가 자동 hydration되어 절차적 지식처럼 사용 가능해야 한다.

2. **갭 질문 엔진(Gap Question Engine)의 능동성 강화**
   - 인과 블록이 비면 사용자에게 질문하여 채움(현재 Epic 3 구현됨).
   - v2에서는 질문의 타이밍·번들·우선순위·답변 학습 루프를 더 정교화한다.

3. **개인 온톨로지 → 거대 온톨로지 export 가능성**
   - 개인화 micro-ontology의 누적분이 익명화·표준화되어 **공유 가능한 도메인 온톨로지 데이터**로 추출되는 경로를 설계.
   - export 포맷, 익명화 정책, 라이선스 모델까지 포함.

4. **PAI 정체성 기반 자가성장**
   - 최근 커밋 `bb2c6d5 feat: PAI identity layer (v1 + v1.5)` 기반.
   - PAI를 "기본 소스"로 하여 사용자 패턴 학습 → **스킬 자동 합성(Skill Synthesizer)** 까지 진화.
   - 학습 대상: 작업 패턴, 도구 선호, 응답 스타일, 의사결정 휴리스틱.
   - 출력: 자동 생성 skill markdown, 자동 생성 hook, 자동 생성 flow-pattern yaml.

5. **OMX/OMC 수준의 배포·프로파일·튜토리얼·엣지케이스 대응**
   - install/uninstall 멱등성, 부분 실패 복구, 버전 마이그레이션, 충돌 감지.
   - 사용자/프로젝트/팀 프로파일 분리.
   - `/cfgm-doctor`, `/cfgm-setup`, `/cfgm-hud` 같은 OMC 동등 운영 도구.
   - 첫 실행 onboarding tutorial, 오류 메시지 카탈로그, telemetry-free troubleshooting.

## 차별화 비교 대상
다음 프로젝트의 메모리/하네스 설계를 명시적으로 비교하고 어디서 우월한지 청구한다.
- PAI (claude-pai)
- claude-mem
- OpenClaw
- Hermes (AI agent harness)
- mem0, Letta, Zep, GraphRAG
- Anthropic Skills + memory tool

각 비교 대상에 대해 **어떤 기능이 우리에게 있고 그쪽엔 없는지**, 또는 **있어도 우리 구현이 어떻게 더 나은지**를 표로 정리.

## 1% 발명 요소 도출 규칙
다음을 모두 만족하는 신규 발명 포인트를 **최소 3개 이상** 발굴한다.
- 기존 PRD 16장의 4개 청구 포인트(hook-native problem graph compilation / gap-driven completion / dual-ledger / compaction-surviving causal state)를 넘어서는 것
- 단순 조합이 아니라 **상호작용 메커니즘**
- 파일 흔적으로 입증 가능
- 1년 내 구현 가능한 현실 범위

## 토론 프로토콜 (반드시 이 순서)

### Round 1 — 현황 진단 (각자 단독 작성)
모든 멤버가 다음 질문에 1페이지로 답한다.
- Epic 0~6에서 사용자 5대 진화 축에 가장 못 미치는 부분은?
- 가장 큰 기술 부채는?
- v2에서 폐기하거나 갈아엎어야 할 결정은?

### Round 2 — 비교 분석
- 차별화 비교 대상 표 작성
- "우리에게만 있는 것" / "그쪽이 더 나은 것" / "우리가 따라잡아야 하는 것" 분류

### Round 3 — 신규 발명 포인트 브레인스토밍
- 1% 발명 요소 후보 ≥10개 발굴
- 위 발명성 규칙으로 ≥3개로 압축
- 각 후보에 대해 청구항 초안 1문장 + 실시예 스케치

### Round 4 — 고도화 설계 (충돌 해결 라운드)
- Round 3 결과를 시스템 아키텍처에 반영
- 데이터 모델 변경, 새 hook, 새 디렉토리 구조 제안
- 기존 Epic 0~6과의 backward compatibility 전략

### Round 5 — 배포·DX·튜토리얼·엣지케이스
- `.omc/`, `.omx/` 직접 분석 후 그 패턴을 우리 install/setup/doctor/hud로 매핑
- 프로파일 모델: user / project / team / cross-platform(claude+codex+gemini)
- 엣지케이스 카탈로그: 권한 거부, 동시 세션, 부분 마이그레이션, hook 등록 실패, storage 손상, 시간 역행, PAI 충돌
- 각 엣지케이스에 대한 검증된 복구 경로

### Round 6 — 합의 + 산출
중재자가 다음 4개 산출물을 단일 문서로 통합한다.
- `docs/superpowers/specs/2026-04-20-cfgm-v2-rfc.md`
- `docs/superpowers/plans/2026-04-20-cfgm-v2-roadmap.md` (Epic 7~12 분해)
- `docs/superpowers/specs/2026-04-20-cfgm-v2-distribution-dx.md`
- `docs/superpowers/specs/2026-04-20-cfgm-v2-invention-claims.md`

## 팀 역할 (이 멤버로 구성)
- **Architect** (Opus급 사고): 시스템 일관성·계층 분리·backward compatibility 책임
- **Memory/KG Engineer**: Flow Graph, micro-ontology, dual-ledger, 시간 모델 심화
- **Causal Reasoning Specialist**: Gap Question Engine v2, VOI 산식 정교화, 답변 학습 루프
- **PAI/Identity Specialist**: PAI v1.5 → v2, skill synthesizer 메커니즘 설계
- **Distribution/DX Engineer**: OMX/OMC 패턴 흡수, install·doctor·hud·setup·migration 설계
- **Adversary/Critic**: 모든 라운드에서 비교 대상 관점에서 약점 공격, 과설계 방지, "이거 정말 필요한가" 질문
- **Patentability Reviewer**: 1% 발명 요소가 청구 가능한 형태인지 평가, 선행기술 충돌 점검
- **Korean Synthesizer (중재자)**: 라운드 간 합의 정리, 한국어 RFC 작성, 충돌 해결

## 산출물 품질 기준
- 모든 결정에 **근거 파일 라인 인용** (예: `src/core/gap/VoiScorer.ts:42`)
- 모든 신규 발명에 **기존 청구항과의 차이** 명시
- 모든 엣지케이스에 **재현 시나리오 + 복구 경로**
- backward compatibility 깨면 **마이그레이션 스크립트 시나리오**
- 모든 RFC는 한국어. 코드 식별자만 영어.

## 금지 사항
- 코드 구현 금지. 설계 문서와 의사결정만.
- "나중에 정한다" 식 회피 금지. 모든 의사결정은 이번 토론에서 닫는다.
- 기존 Epic 0~6의 결정 부정만 하고 대안 없는 비판 금지.
- 막연한 "더 좋게" 금지. 측정 가능한 기준으로 표현.

## 종료 조건
4개 산출물이 작성되고, Adversary와 Patentability Reviewer가 모두 sign-off 할 때 종료한다.
sign-off 거부 시 그 라운드부터 재진행한다.
