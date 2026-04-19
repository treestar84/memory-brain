# ADR-001: Storage 인터페이스 추상화

**날짜**: 2026-04-17  
**상태**: 채택됨  
**관련 에픽**: Epic 0

---

## 결정

파일시스템 접근을 `Storage` 인터페이스로 추상화하고, `FsStorage`(프로덕션)와 `MemoryStorage`(테스트)를 병렬 구현한다.

## 배경

모든 핵심 서비스(FlowGraphStore, QuestionQueue, OntologyModule 등)가 Storage를 생성자 주입으로 받는다. 테스트에서는 `MemoryStorage`에 초기 데이터를 `writeRaw()`로 시드하고, 실제 파일시스템 없이 순수 단위 테스트가 가능하다.

## 결과

- 모든 서비스는 `new ServiceClass(storage, clock, ...)` 패턴으로 생성
- 테스트는 `new MemoryStorage()` 사용, E2E 테스트만 `FsStorage` + tmpdir 사용
- 스토리지 경로는 서비스 내부 `private path()` 메서드로 캡슐화

## 대안

- 직접 `fs` 사용: 테스트 시 파일시스템 의존성 → 거부
- Jest mock: bun test에서 불안정 → 거부
