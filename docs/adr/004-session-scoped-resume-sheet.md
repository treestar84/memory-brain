# ADR-004: 세션 스코프 resume-sheet + consume-once 복원

**날짜**: 2026-04-19
**상태**: 채택됨 (Epic 5 브레인스토밍 결정, 2026-04-19 Codex adversarial review 후 전제 명시)
**관련 에픽**: Epic 5

---

## 결정

PreCompact 훅이 생성하는 resume-sheet를 `state/resume-sheet-<sessionId>.json`에 저장하고, SessionStart에서 `state/resume-sheet-*.json` 중 `generatedAt` 기준 최신 파일을 읽은 뒤 **모든 후보 파일을 삭제**한다 (consume-once + sweep).

## 배경

컨텍스트 컴팩션 후 세션이 재시작될 때 FlowGraph 델타·미해결 gap·다음 질문을 잃지 않기 위해 PreCompact 시점에 스냅샷을 저장해야 한다.

저장 위치 후보:
- A. `state/resume-sheet.json` (프로젝트 레벨): 단순하지만 여러 세션 동시 실행 시 덮어씀
- B. `problems/<id>/resume-sheet.json` (문제 레벨): 문제 전환 시 stale 파일 잔존
- **C. `state/resume-sheet-<sessionId>.json` (세션 레벨)**: 선택됨

C를 선택한 이유: Claude가 compaction 전후로 세션을 내부적으로 어떻게 추적할지 사전에 단언할 수 없다. 파일명에 sessionId를 넣어 두면 PreCompact 시점의 식별자와 SessionStart 시점의 식별자가 달라도 파일을 찾아 읽을 수 있다.

## consume-once 방식

SessionStart에서 `listFiles("state")`로 모든 resume-sheet 파일을 찾아, 가장 최근 `generatedAt`의 유효한 파일 하나를 읽은 뒤 **모든 후보 파일을 삭제**한다. 이렇게 하면:
- 별도 정리(cleanup) 로직 불필요
- "한 번만 복원" 시맨틱이 명확
- 오래된 파일이 무한 쌓이지 않음
- compaction 전후 sessionId 변경에 무관하게 복원 가능

## 비-목표 (의도된 제약)

**멀티 세션 동시성 안전은 목표가 아니다.** memory-brain은 다음 전제 하에 설계되었다:

- 전용 프로파일 + 전용 working directory에서 실행
- 단일 장기 세션이 주기적으로 compaction → resume 하는 흐름
- 여러 터미널/탭에서 동시에 같은 프로젝트를 편집하는 시나리오는 범위 밖

따라서 `ResumeSheetReader.consume()`이 다른 세션의 파일을 삭제할 수 있다는 점은 **의도된 단순화**다. Codex adversarial review(2026-04-19)가 이 동작을 "critical"로 지적했으나, 위 전제 하에서는 문제가 되지 않음을 확인하고 수용했다.

향후 멀티 세션 지원이 필요해지면:
- `consume(sessionId)` 시그니처로 범위를 좁히거나
- PreCompact 시점에 "parent → next" 세션 매핑을 기록하는 방식으로 확장

지금은 YAGNI.

## 결과

- `src/core/compaction/ResumeSheetWriter.ts`: 스냅샷 수집·직렬화
- `src/core/compaction/ResumeSheetReader.ts`: consume-once + sweep
- `src/hooks/pre-compact.ts`: PreCompact 훅 (best-effort, try/catch로 storage 실패 흡수)
- `bin/install.ts`: PreCompact 훅 등록 추가
- `src/hooks/session-start.ts`: consume-once reader 통합

## 대안

- 프로젝트 레벨 단일 파일: 여러 세션 동시 실행 시 race condition → 거부
- Ledger 기록 방식: 과도한 복잡도, 오버엔지니어링 → 거부
- sessionId 기반 엄격 매칭: compaction 전후 sessionId 변경 가능성 → 거부
