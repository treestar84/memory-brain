/**
 * 최상위가 JSON 배열인 대용량 파일(수백 MB ~ 수 GB)을 스트리밍으로 파싱한다.
 *
 * 배경: `Bun.file(path).text()` 로 2.5GB 파일 전체를 문자열로 들고 있으면 JS
 * 문자열 상한(~2GB)을 초과해 SIGTRAP(무출력 크래시)이 난다. 파일 전체를
 * 문자열/객체로 동시에 들고 있지 않는 것이 본 모듈의 핵심 제약이다 — 개별
 * 원소(질문 1건) 버퍼만 메모리에 유지하고, 파싱된 원소는 즉시 yield 해
 * 호출측이 소비 후 버리게 한다.
 *
 * 외부 스트리밍 JSON 라이브러리 의존 없이 직접 구현한 문자 단위 상태 기계다.
 */

/** 문자열 내부 여부(inString)와 이스케이프(escape) 를 정확히 추적해야 구조
 * 문자(`{`,`}`,`[`,`]`,`,`)를 텍스트 내용과 혼동하지 않는다. */
type Phase = "before-array" | "before-element" | "in-element" | "after-array";

const WHITESPACE_RE = /\s/;

/**
 * `ReadableStream<Uint8Array>` 를 받아 최상위 배열의 각 원소를 하나씩
 * `JSON.parse` 해 yield 한다. 테스트가 `Bun.file(...).stream()` 없이도
 * 작은 chunk 를 주입할 수 있도록 스트림 기반 함수를 별도로 노출한다.
 */
export async function* streamJsonArrayFromReadableStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8");

  let phase: Phase = "before-array";
  let depth = 0; // 현재 원소 내부의 중첩 {}/[] 깊이 (0 = 원소 최상위, 원시값 포함)
  let inString = false;
  let escape = false;
  let elementBuf = "";
  let sawArrayOpen = false;
  let sawArrayClose = false;

  // 한 문자 처리 도중 원소가 완성되면 여기에 쌓았다가 즉시 yield 한다.
  const ready: unknown[] = [];

  function finalizeElement(): void {
    const trimmed = elementBuf.trim();
    if (trimmed.length > 0) {
      ready.push(JSON.parse(trimmed));
    }
    elementBuf = "";
    depth = 0;
    inString = false;
    escape = false;
    phase = "before-element";
  }

  function processChar(ch: string): void {
    if (phase === "before-array") {
      if (WHITESPACE_RE.test(ch)) return;
      if (ch === "[") {
        sawArrayOpen = true;
        phase = "before-element";
        return;
      }
      throw new Error(`streamTopLevelJsonArray: 최상위가 JSON 배열이 아닙니다 (문자 '${ch}' 발견)`);
    }

    if (phase === "after-array") {
      if (WHITESPACE_RE.test(ch)) return;
      throw new Error(`streamTopLevelJsonArray: 배열 종료(']') 이후 예기치 않은 문자: '${ch}'`);
    }

    if (phase === "before-element") {
      if (WHITESPACE_RE.test(ch)) return;
      if (ch === ",") return; // 원소 사이 구분자 (trailing comma 도 관대하게 허용)
      if (ch === "]") {
        phase = "after-array";
        sawArrayClose = true;
        return;
      }
      phase = "in-element";
      // fallthrough — 이 문자 자체가 원소의 첫 문자다.
    }

    // phase === "in-element"
    if (inString) {
      elementBuf += ch;
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      return;
    }

    if (ch === '"') {
      inString = true;
      elementBuf += ch;
      return;
    }

    if (ch === "{" || ch === "[") {
      depth++;
      elementBuf += ch;
      return;
    }

    if (ch === "}" || ch === "]") {
      if (depth === 0) {
        // 원시값(숫자/불리언/null/문자열 이미 종료) 원소 뒤에 바로 최상위
        // ']' 가 온 경우 — 원소를 마무리하고 배열 종료로 전이한다.
        finalizeElement();
        phase = "after-array";
        sawArrayClose = true;
        return;
      }
      depth--;
      elementBuf += ch;
      if (depth === 0) finalizeElement();
      return;
    }

    if (ch === "," && depth === 0) {
      finalizeElement();
      return;
    }

    elementBuf += ch;
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // {stream: true} — chunk 경계에서 멀티바이트 UTF-8 시퀀스가 잘려도
      // TextDecoder 가 다음 chunk 와 이어붙여 정확히 디코딩한다.
      const text = decoder.decode(value, { stream: true });
      for (const ch of text) {
        processChar(ch);
        if (ready.length > 0) {
          for (const item of ready.splice(0)) yield item;
        }
      }
    }
    const tail = decoder.decode(); // flush — 남은 바이트 없으면 빈 문자열
    for (const ch of tail) {
      processChar(ch);
      if (ready.length > 0) {
        for (const item of ready.splice(0)) yield item;
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!sawArrayOpen) {
    throw new Error("streamTopLevelJsonArray: 최상위가 JSON 배열이 아닙니다 (빈 입력 또는 '[' 없음)");
  }
  if (!sawArrayClose) {
    throw new Error("streamTopLevelJsonArray: JSON 배열이 닫히지 않았습니다 (truncated)");
  }
}

/**
 * 파일 경로를 받아 top-level 이 JSON 배열인 파일을 스트리밍으로 읽어
 * 원소를 하나씩 parse 해 yield 한다. 개별 원소 버퍼만 메모리에 유지하며,
 * 전체 파일을 문자열/객체로 동시에 들고 있는 코드 경로가 없다.
 */
export async function* streamTopLevelJsonArray(path: string): AsyncGenerator<unknown> {
  const stream = Bun.file(path).stream();
  yield* streamJsonArrayFromReadableStream(stream);
}
