# ADR-003: 비동기 throw 단언에 try/catch 패턴 사용

**날짜**: 2026-04-18  
**상태**: 채택됨  
**관련 에픽**: Epic 4 (E4-S4)

---

## 결정

bun test에서 비동기 함수의 예외 발생 단언은 `expect(fn).rejects.toThrow()` 대신 명시적 `try/catch + boolean` 패턴을 사용한다.

```typescript
test("throws when module missing", async () => {
  let threw = false;
  try {
    await module.recordPatterns("missing", {});
  } catch {
    threw = true;
  }
  expect(threw).toBe(true);
});
```

## 배경

bun-types에서 `.rejects.toThrow()` 반환 타입이 `void`로 정의되어 `await`가 효과 없음 (TS 경고 80007). 함수 래퍼 형식 `expect(() => asyncFn()).rejects.toThrow()`는 런타임에서 2개 테스트 실패 발생.

## 결과

- 모든 비동기 throw 테스트에 try/catch 패턴 적용 (OntologyModule, 이후 Epic들)
- 동기 함수의 `expect(() => fn()).toThrow()`는 그대로 사용 가능

## 대안

- `expect(promise).rejects.toThrow()`: TS 경고, bun에서 불안정 → 거부
- 동기 래퍼: 비동기 로직을 동기로 바꿀 수 없음 → 거부
