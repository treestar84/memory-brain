# ADR-004: 세션 스코프 resume-sheet + consume-once 복원

**날짜**: 2026-04-19  
**상태**: 채택됨 (Epic 5 브레인스토밍 결정)  
**관련 에픽**: Epic 5

---

## 결정

PreCompact 훅이 생성하는 resume-sheet를 `state/resume-sheet-<sessionId>.json`에 저장하고, SessionStart에서 읽은 즉시 삭제(consume-once)한다.

## 배경

컨텍스트 컴팩션 후 세션이 재시작될 때 FlowGraph 델타·미해결 gap·다음 질문을 잃지 않기 위해 PreCompact 시점에 스냅샷을 저장해야 한다.

저장 위치 후보:
- A. `state/resume-sheet.json` (프로젝트 레벨): 단순하지만 여러 세션 동시 실행 시 덮어씀
- B. `problems/<id>/resume-sheet.json` (문제 레벨): 문제 전환 시 stale 파일 잔존
- **C. `state/resume-sheet-<sessionId>.json` (세션 레벨)**: 선택됨

C를 선택한 이유: Claude Code는 여러 터미널 탭에서 동시에 열릴 수 있고, 각 세션이 독립적으로 PreCompact를 실행할 수 있다. sessionId로 키를 부여하면 충돌 없이 각 세션의 상태를 보존 가능.

## consume-once 방식

SessionStart에서 `listFiles("state", "resume-sheet-*.json")`으로 가장 최근 파일을 찾아 읽고, 읽은 직후 삭제한다. 이렇게 하면:
- 별도 정리(cleanup) 로직 불필요
- "한 번만 복원" 시맨틱이 명확
- 오래된 파일이 무한 쌓이지 않음

## 결과

- `src/core/compaction/ResumeSheetWriter.ts`: 스냅샷 수집·직렬화
- `src/hooks/pre-compact.ts`: PreCompact 훅 (새로 생성)
- `bin/install.ts`: PreCompact 훅 등록 추가
- `src/hooks/session-start.ts`: consume-once reader 추가

## 대안

- 프로젝트 레벨 단일 파일: 여러 세션 동시 실행 시 race condition → 거부
- Ledger 기록 방식: 과도한 복잡도, 오버엔지니어링 → 거부
