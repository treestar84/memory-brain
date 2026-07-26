/**
 * rot-bench 외부 어댑터 프로토콜 (팀리드 지시 — 2026-07-25).
 *
 * "당신의 메모리 도구로 memory rot 을 측정해보라" 초대장의 실행부. 언어 무관
 * subprocess JSONL 프로토콜로 어떤 외부 메모리 도구든 naive/governed 와
 * 동일 조건(RotBench 체크포인트×채점)에서 측정될 수 있게 한다.
 *
 * 프로토콜 (docs/ROT-BENCH.md §Adapter protocol 명세와 동일):
 *   - 외부 프로세스를 1회 spawn, stdin/stdout 을 JSONL 로 통신한다.
 *   - 요청 1줄/평가: {"id": "<questionId>@<checkpoint>", "query": "...",
 *     "top_k": 10, "sessions": [{"id": "...", "date": "...", "text": "..."}]}
 *   - 응답 1줄/평가 (같은 id): {"id": "...", "ranked": ["sessionId", ...]}
 *     (top_k 개 이하)
 *   - 평가당 타임아웃(기본 30s). 잘못된 응답/누락 id/EOF 는 해당 평가를
 *     오류로 기록하되 크래시하지 않는다 — 호출측이 ranked=[] 로 정직 채점한다.
 */

export interface RotAdapterSessionInput {
  id: string;
  date?: string;
  text: string;
}

/** 어댑터에 보내는 평가 1건 요청. */
export interface RotAdapterRequest {
  id: string;
  query: string;
  top_k: number;
  sessions: RotAdapterSessionInput[];
}

/** 어댑터가 stdin 으로 돌려주는 정상 응답 형태 (파싱 전 원형). */
interface RotAdapterRawResponse {
  id?: unknown;
  ranked?: unknown;
}

/** 평가 1건의 결과 — 정상/오류 모두 이 형태로 통일해 호출측이 항상 정직 채점할 수 있게 한다. */
export interface RotAdapterResult {
  id: string;
  /** 오류 시 항상 [] — 호출측은 이를 그대로 hit=false 로 채점한다 (보정 금지). */
  ranked: string[];
  /** 오류 사유 (타임아웃/잘못된 JSON/누락 id/EOF 등). 정상 응답이면 undefined. */
  error?: string;
}

export interface RotAdapterOpts {
  /** 평가 1건당 타임아웃 (ms). 기본 30000. */
  timeoutMs?: number;
}

type ReadOutcome = { kind: "line"; value: string } | { kind: "eof" } | { kind: "timeout" };

/**
 * stdout ReadableStream 을 줄 단위로 읽는 커서. 타임아웃으로 next() 가
 * 중단돼도 진행 중인 reader.read() 프로미스는 버리지 않고 다음 next() 호출에서
 * 이어받는다 — Bun ReadableStreamDefaultReader 는 동시 read() 를 허용하지
 * 않으므로 반드시 하나의 in-flight read 만 유지해야 한다.
 */
class LineCursor {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private decoder = new TextDecoder();
  private buffer = "";
  private pending: Promise<{ done: boolean; value?: Uint8Array }> | null = null;
  private eof = false;

  constructor(stream: ReadableStream<Uint8Array>) {
    this.reader = stream.getReader();
  }

  /**
   * reader 를 해제한다 — 호출하지 않으면 Bun 이벤트 루프가 stdout 스트림을
   * 계속 참조해 프로세스가 종료되지 않고 걸리는 현상이 있었다 (실측: --adapter
   * 사용 시 CLI 가 결과 출력 후 종료하지 못함). in-flight read() 가 있으면
   * 먼저 cancel 을 시도해 정리한다.
   */
  async dispose(): Promise<void> {
    try {
      await this.reader.cancel();
    } catch {
      // 이미 닫혀 있거나 취소 불가 — 무시
    } finally {
      try {
        this.reader.releaseLock();
      } catch {
        // no-op
      }
    }
  }

  /** 다음 한 줄을 최대 timeoutMs 안에 반환한다. 개행 없는 잔여 버퍼는 EOF 시 마지막 줄로 취급. */
  async next(timeoutMs: number): Promise<ReadOutcome> {
    const deadlineAt = Date.now() + Math.max(0, timeoutMs);
    for (;;) {
      const nlIdx = this.buffer.indexOf("\n");
      if (nlIdx >= 0) {
        const line = this.buffer.slice(0, nlIdx);
        this.buffer = this.buffer.slice(nlIdx + 1);
        return { kind: "line", value: line };
      }
      if (this.eof) {
        if (this.buffer.length > 0) {
          const line = this.buffer;
          this.buffer = "";
          return { kind: "line", value: line };
        }
        return { kind: "eof" };
      }

      const remaining = deadlineAt - Date.now();
      if (remaining <= 0) return { kind: "timeout" };

      if (!this.pending) this.pending = this.reader.read();
      const timeoutToken = Symbol("timeout");
      // race 에서 진 setTimeout 을 clearTimeout 하지 않으면, read() 가 먼저
      // 응답해도 이 타이머가 최대 remaining(ms) 만큼 Bun 이벤트 루프를 계속
      // 붙잡아 프로세스가 종료되지 않는다 (실측: --adapter 사용 시 CLI 가
      // 정상 완료 후에도 기본 timeoutMs=30s 만큼 걸리는 현상의 근본 원인).
      let timer: ReturnType<typeof setTimeout> | undefined;
      const winner = await Promise.race([
        this.pending,
        new Promise<typeof timeoutToken>((res) => {
          timer = setTimeout(() => res(timeoutToken), remaining);
        }),
      ]);
      if (timer !== undefined) clearTimeout(timer);
      if (winner === timeoutToken) return { kind: "timeout" };

      const result = winner as { done: boolean; value?: Uint8Array };
      this.pending = null;
      if (result.done) {
        this.eof = true;
        continue;
      }
      this.buffer += this.decoder.decode(result.value, { stream: true });
    }
  }
}

/**
 * 외부 어댑터 프로세스를 1회 spawn 해 requests 를 순차 JSONL 로 보내고
 * 응답을 매칭해 채점 가능한 형태로 돌려준다. 프로세스가 크래시/응답없음
 * 이어도 예외를 던지지 않고 해당 평가(및 EOF 이후 나머지 전부)를 오류로
 * 기록한다 — 호출측(RotBench)이 정직하게 hit=false 로 채점하기 위함.
 */
export async function runExternalAdapter(
  command: string[],
  requests: RotAdapterRequest[],
  opts: RotAdapterOpts = {},
): Promise<RotAdapterResult[]> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  if (requests.length === 0) return [];
  if (command.length === 0) throw new Error("runExternalAdapter: command 가 비어 있음");

  const proc = Bun.spawn(command, { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  const cursor = new LineCursor(proc.stdout as ReadableStream<Uint8Array>);
  const results: RotAdapterResult[] = [];
  let eofReached = false;

  for (const req of requests) {
    if (eofReached) {
      results.push({ id: req.id, ranked: [], error: "adapter process closed stdout (EOF) — 이전 평가에서 프로세스 종료" });
      continue;
    }

    try {
      proc.stdin.write(`${JSON.stringify(req)}\n`);
      await proc.stdin.flush();
    } catch (err) {
      eofReached = true;
      results.push({ id: req.id, ranked: [], error: `stdin write 실패: ${err instanceof Error ? err.message : String(err)}` });
      continue;
    }

    const deadlineAt = Date.now() + timeoutMs;
    let outcome: RotAdapterResult | null = null;
    for (;;) {
      const remaining = deadlineAt - Date.now();
      if (remaining <= 0) {
        outcome = { id: req.id, ranked: [], error: "timeout" };
        break;
      }
      const read = await cursor.next(remaining);
      if (read.kind === "timeout") {
        outcome = { id: req.id, ranked: [], error: "timeout" };
        break;
      }
      if (read.kind === "eof") {
        eofReached = true;
        outcome = { id: req.id, ranked: [], error: "adapter process closed stdout (EOF)" };
        break;
      }
      // read.kind === "line"
      const trimmed = read.value.trim();
      if (trimmed.length === 0) continue; // 빈 줄은 무시하고 계속 대기
      let parsed: RotAdapterRawResponse;
      try {
        parsed = JSON.parse(trimmed) as RotAdapterRawResponse;
      } catch {
        // 잘못된 JSON — 이 줄은 버리고 남은 타임아웃 예산 내에서 계속 대기.
        continue;
      }
      if (typeof parsed.id !== "string") continue; // id 없는 줄은 무시하고 계속 대기
      if (parsed.id !== req.id) continue; // 다른 요청의 응답(지연 도착) — 무시하고 계속 대기
      if (!Array.isArray(parsed.ranked) || !parsed.ranked.every((x) => typeof x === "string")) {
        outcome = { id: req.id, ranked: [], error: "invalid response: ranked 가 문자열 배열이 아님" };
        break;
      }
      outcome = { id: req.id, ranked: parsed.ranked as string[] };
      break;
    }
    results.push(outcome!);
  }

  try {
    proc.stdin.end();
  } catch {
    // 이미 닫혀 있으면 무시
  }
  // stdout reader 미해제 + stderr 파이프 미소비가 Bun 이벤트 루프를 계속
  // 붙잡아 CLI 가 종료하지 못하는 원인이었다 — 둘 다 명시적으로 정리한다.
  await cursor.dispose();
  try {
    await new Response(proc.stderr as ReadableStream<Uint8Array>).text();
  } catch {
    // stderr 소비 실패는 결과에 영향 없음
  }
  try {
    let exitTimer: ReturnType<typeof setTimeout> | undefined;
    const exited = await Promise.race([
      proc.exited.then(() => true),
      new Promise<boolean>((res) => {
        exitTimer = setTimeout(() => res(false), 2_000);
      }),
    ]);
    if (exitTimer !== undefined) clearTimeout(exitTimer);
    if (!exited) proc.kill();
  } catch {
    // 종료 대기 실패는 결과에 영향 없음 — 이미 채점 완료
  }

  return results;
}
