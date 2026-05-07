# memory-brain — Architectural Principles & Rules

> **본 프로젝트의 정체성**: memory-brain 은 **production-grade, 전세계 오픈소스 메모리 엔진** 이다. **MVP 가 아니다.** 모든 설계 결정은 production · open-source · vendor-agnostic 관점에서 내린다.

본 문서는 CLAUDE.md / MEMORY.md bootloader 가 비대해지는 걸 막기 위해 분리한 핵심 원칙 모음이다. 새로운 코드를 추가하기 전에 본 문서를 먼저 확인할 것. 본 문서의 원칙과 충돌하는 코드는 작성하지 않는다.

---

## 정체성 선언 (변경 금지)

<!-- claim:cl-rules-001 -->
memory-brain 은 **production-grade open-source memory engine** 이다. MVP·prototype 이 아니다. 따라서:

- "일단 동작하면 OK" 의 코드를 작성하지 않는다.
- 사용자(end-user) 가 비용을 추가 부담하는 default 설계를 만들지 않는다.
- 특정 vendor 에 lock-in 되는 인터페이스를 default 로 두지 않는다.
- 외부 의존성을 추가할 때 production 운영 관점의 영향을 모두 고려한다.

---

## 4 핵심 원칙

### 원칙 1 — MCP 를 사용하지 않는다

<!-- claim:cl-rules-002 -->
memory-brain 본체 코드 및 default 흐름에서 **MCP (Model Context Protocol) 서버 / 클라이언트 / tool 인터페이스를 사용하지 않는다.**

**Why:**
- MCP 는 host CLI 마다 지원·설정이 상이해 vendor-agnostic 보장이 어렵다.
- MCP 의존은 사용자 환경 설정 부담을 키우고 production 배포의 진입 장벽을 높인다.
- 메모리 엔진의 인터페이스는 더 보편적인 매체(파일, 자연어 명세) 로 표현되어야 한다.

**예외:**
- 반드시 필요한 경우에만 사용자에게 명시적으로 확인 받은 뒤 도입.
- 도입 시에도 default off, opt-in 설계.

**적용:**
- `mcp__*` tool 호출, MCP server SDK import, MCP-only 인터페이스 신설 모두 금지.
- 기존 코드에 MCP 진입점이 발견되면 본 원칙 위반으로 보고 제거 검토.

---

### 원칙 2 — 구독 auth 가 기본, API 토큰 호출은 default 가 아니다

<!-- claim:cl-rules-003 -->
memory-brain 은 **Claude Code · Codex · Gemini CLI 등 host CLI 위에서 동작**한다. 이들 host 는 사용자가 이미 구독으로 결제한 LLM access 를 보유한다. 따라서 메모리 엔진의 LLM 작업은 **host 의 구독 auth 채널을 그대로 위임 활용**한다.

**금지:**
- `@anthropic-ai/sdk` / `openai` / 기타 LLM SDK 를 default 흐름에서 직접 호출.
- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` 등의 환경 변수를 default 진입점에서 요구.
- 사용자가 별도 API 토큰을 발급·관리하도록 강제하는 default 설계.

**허용 (off-default 한정):**
- 명시적 off-host 모드 (예: CI batch, headless cron) 에서 SDK 직접 호출 — 단 명시적 opt-in 플래그 + 비용 경고 필수.
- 본인 호스팅 inference 서버를 가진 사용자의 자유 선택.

**올바른 패턴:**
- 메모리 엔진은 LLM 작업의 **명세(prompt + schema + 입력)** 만 만든다.
- 실제 LLM 호출은 host CLI 의 자연 흐름(read · 추론 · write) 안에서 host 의 LLM 이 처리.
- 결과는 메모리 엔진이 검증(validateSSL gate 등) 후 저장.

---

### 원칙 3 — OMC / OMX 등 외부 도구에 의존하지 않는다

<!-- claim:cl-rules-004 -->
memory-brain 본체는 **oh-my-claudecode (OMC), OMX, 기타 외부 orchestration 도구에 종속되지 않는다.** 단독으로 git clone → 설치 → 동작 가능해야 한다.

**금지:**
- OMC skill / agent / hook 을 호출 경로에 포함.
- OMX runtime 을 default 의존성으로 추가.
- 외부 plugin 시스템에만 동작하는 진입점 설계.

**허용:**
- OMC / OMX 사용자가 별도 wrapper 로 통합하는 것은 자유.
- 메모리 엔진 본체는 그런 wrapper 가 없어도 fully functional.

---

### 원칙 4 — Production 품질 기준

<!-- claim:cl-rules-005 -->
모든 PR · 모든 코드 추가는 **production deploy 가능한 품질** 을 충족한다.

**의무:**
- 외부 사용자가 README 만 보고 git clone → 설치 → 사용 가능.
- 모든 default 설정이 합리적이고 안전 (사용자 수동 설정 최소화).
- 테스트 커버리지 ≥ 90% (신규 코드 기준), typecheck 통과, 회귀 0 건.
- Vendor-agnostic — 특정 LLM provider · CLI 에 lock-in 되지 않음.
- 명세 문서화 — schema · contract · 운영 규칙은 wiki page 또는 본 docs/ 에 기록.
- 비용 · 보안 · 데이터 위치를 사용자가 통제할 수 있게 설계.

**금지:**
- "MVP 라서 일단" 식의 단축 결정.
- "사용자가 알아서 설정" 가정.
- 검증되지 않은 closed-source dependency.
- **Claude 행동 금지 — 스코프 축소 제안**: 설계·구현 단계에서 "MVP로 줄이자", "일단 최소한만", "나중에 추가하자" 식으로 기능 범위를 축소하도록 사용자에게 권고하지 않는다. 본 프로젝트는 production-grade OSS 이므로 처음부터 올바르게 설계한다. 단, 사용자가 먼저 "작게 시작하겠다"고 결정하면 따른다.

---

### 원칙 5 — 분리 프로파일 / 분리 세션 영구 메모리 관리

<!-- claim:cl-rules-007 -->
memory-brain 은 **별도 프로파일·별도 세션** 에서 실행되며, 그 분리된 세션 안에서 **영구적으로 (continuously)** 자기 기억을 정리·관리한다. 사용자의 메인 세션 (코딩·분석 등 사용자 본업이 일어나는 곳) 은 메모리 정리 작업에 동원되지 않는다.

**Why:**
- 메인 세션 컨텍스트가 메모리 처리 (normalize · governance · dedupe · compact) 로 오염되면 사용자 본업의 토큰 효율·집중도가 떨어진다.
- 메모리 정리는 **장시간·반복적·idempotent** 한 작업으로, 별도 세션에서 background 형태로 도는 것이 본질에 부합한다.
- "분리" 가 보장되어야 메인 세션에서 본 결과(검색·viewer)와 정리 주체(분리 세션) 사이의 **읽기·쓰기 책임 경계** 가 명확해진다.

**아키텍처 형태:**
- **분리 세션** — host CLI 의 별도 프로파일·인스턴스로 실행. 자기 LLM 채널을 가지며 (원칙 2 의 host 구독 auth 위에서) 메모리 큐를 자율 처리.
- **메인 세션** — 메모리에 read-only 인터페이스 (router 통한 검색, dashboard, validate CLI) 만 사용. 메모리 정리 작업을 직접 호출하지 않는다.
- **인터페이스** — 분리 세션과 메인 세션은 모두 **`memory/` 파일 시스템** 으로만 통신. 메시지 큐·RPC·MCP 없음 (원칙 1).

**금지:**
- 메인 세션에 "memory-brain 작업 처리해줘" 같은 자연어 요청을 default 흐름으로 두는 설계 (메인 세션 동원).
- 메모리 정리를 위해 사용자가 매번 명시적으로 트리거 해야만 하는 설계 (영구성·자율성 원칙 위반).
- 분리 세션이 메인 세션의 컨텍스트를 추론·복제하려 시도하는 설계 (분리 경계 침범).

**허용 (분리 세션 트리거 후보):**
- 사용자 명시 시작 (`bun run memory-brain:start`) → 별도 프로파일 인스턴스 spawn → 큐 비우고 idle / 종료.
- 시스템 스케줄러 (cron · launchd · systemd) → 주기적 별도 인스턴스 spawn.
- File-system watcher / hook → 변경 감지 시 분리 인스턴스 wake-up.
- 세션 시작/종료 hook → 메인 세션 종료 시 분리 인스턴스가 그 세션에서 발생한 변경을 정리.

**적용:**
- 새 진입점 추가 전 "이건 메인 세션이 호출하나, 분리 세션이 호출하나?" 를 명시적으로 정의.
- 메인 세션 호출 진입점은 read-only / display / validate 한정.
- 분리 세션 호출 진입점은 mutate / normalize / governance / compact / archive 한정.
- 두 세션 간 통신은 `memory/` 파일·자연어 명세로만.

---

## 위반 시 처리

<!-- claim:cl-rules-006 -->
본 원칙 위반이 발견되면:

1. **새 코드** — 머지 전 거부, 재설계.
2. **기존 코드** — 위반 사실을 기록 후 다음 PR 에서 deprecate 또는 refactor.
3. **불가피한 위반** — 사용자에게 명시적 확인 받은 뒤 본 문서에 예외 사유 기록.

본 원칙은 silent breach 를 허용하지 않는다. 발견 즉시 사용자에게 보고.

---

## 본 문서의 위치

- 본 파일: `docs/RULES.md`
- 참조: `CLAUDE.md` bootloader 에서 본 파일을 1줄 인용.
- 갱신: 새 원칙 추가 시 `claim:cl-rules-NNN` ID 부여, append-only 정신 유지.
- 본 파일은 **항상 읽힌다** — 개별 PR·세션 시작 시 새 코드 추가 전 먼저 확인.
