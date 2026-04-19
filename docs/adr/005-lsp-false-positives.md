# ADR-005: LSP 오탐 처리 기준

**날짜**: 2026-04-18  
**상태**: 채택됨  
**관련 에픽**: Epic 3~4 전반

---

## 결정

IDE/LSP에서 "Cannot find module" 또는 타입 오류가 표시되더라도 `bun run typecheck` (`tsc --noEmit`)가 클린하면 무시하고 진행한다.

## 배경

새로운 파일을 생성하면 IDE 캐시가 즉시 갱신되지 않아 LSP가 false positive를 보고한다. 실제로 발생한 사례:
- E4-S3: "Cannot find module './OntologyModule'"
- E4-S5: "Expected 2 arguments, but got 3" (ActiveProblemStore.create 3번째 인수)
- E4-S7: "'ontologyModule' does not exist in type 'HookDeps'"

모든 경우 `tsc --noEmit`는 클린하게 통과했다.

## 결론

- `bun run typecheck` 통과 = 타입 안전성 보장
- LSP 표시는 IDE 캐시 문제 → IDE 재시작 또는 무시
- LSP 오류가 있어도 `bun test` + `bun run typecheck` 둘 다 통과하면 커밋 가능

## 대안

- IDE 재시작 강제: 시간 낭비, 개발 흐름 단절 → 비권장
- LSP 오류 우선 처리: false positive를 실제 오류로 오인할 위험 → 거부
