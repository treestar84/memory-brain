/**
 * JSONL 파싱 — 손상된 줄 하나가 원장 전체를 못 읽게 만들지 않는다 (V3.43).
 *
 * append 도중 프로세스가 죽으면(OOM, 강제종료, 디스크풀) 마지막 줄이 잘린 채로
 * 남을 수 있다. 이전엔 그 한 줄의 JSON.parse 실패가 전체 readJsonl 을 던져서,
 * 크래시 이전에 정상적으로 append 된 나머지 줄까지 전부 못 읽게 됐다. 손상된
 * 줄만 건너뛰고 나머지는 그대로 반환한다 — append-only 원장의 "일부 유실은
 * 있어도 전체 유실은 없다" 는 것을 보장한다.
 */
export function parseJsonlLenient<T = unknown>(content: string, sourcePath?: string): T[] {
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  const out: T[] = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      console.error(
        `[jsonl] 손상된 줄 건너뜀${sourcePath ? ` (${sourcePath})` : ""}: ${line.slice(0, 80)}${line.length > 80 ? "..." : ""}`,
      );
    }
  }
  return out;
}
