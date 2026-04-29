/**
 * SessionStart 주입 byte budget 강제 (PR-V3.10).
 *
 * 비전 §11.1 답습 — bootloader 는 정해진 크기를 넘지 않는다.
 * 사용자 지적사항(2026-04-29): "초기 주입은 메모리 라우팅 역할 — 정해진
 * 사이즈 유지". post-build enforce 형태로 단순 처리.
 */

const DEFAULT_TOTAL_LIMIT_BYTES = 8 * 1024;

const enc = new TextEncoder();

export interface EnforceResult {
  lines: string[];
  usedBytes: number;
  originalBytes: number;
  truncated: boolean;
  droppedLines: number;
}

/**
 * lines 배열의 총 byte 가 limit 을 초과하면 끝에서부터 줄 단위 drop.
 * 마지막에 truncation 알림 라인 추가. limit 안에 들어가면 그대로 반환.
 */
export class SessionStartBudget {
  constructor(public readonly limit: number = DEFAULT_TOTAL_LIMIT_BYTES) {}

  enforce(lines: string[]): EnforceResult {
    const originalBytes = byteSize(lines);
    if (originalBytes <= this.limit) {
      return {
        lines,
        usedBytes: originalBytes,
        originalBytes,
        truncated: false,
        droppedLines: 0,
      };
    }

    const result = [...lines];
    let droppedLines = 0;
    while (result.length > 0 && byteSize(result) > this.limit) {
      result.pop();
      droppedLines += 1;
    }

    const notice = `> ⚠️ session-start 출력이 ${this.limit}B 한도 초과로 ${droppedLines}줄 잘림 (원래 ${originalBytes}B).`;
    // notice 추가 후에도 한도 안에 들어가도록 최소 1줄 더 drop
    while (result.length > 0 && byteSize([...result, notice]) > this.limit) {
      result.pop();
      droppedLines += 1;
    }
    result.push(notice);

    return {
      lines: result,
      usedBytes: byteSize(result),
      originalBytes,
      truncated: true,
      droppedLines,
    };
  }
}

function byteSize(lines: string[]): number {
  return enc.encode(lines.join("\n")).byteLength;
}

export const SESSION_START_TOTAL_BUDGET_BYTES = DEFAULT_TOTAL_LIMIT_BYTES;
