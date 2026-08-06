import type { Storage } from "../storage/Storage";
import type { ResumeSheet } from "./types";
import { RESUME_SHEET_VERSION } from "./types";
import { RESUME_SHEET_DIR, isResumeSheetFilename } from "./config";

/**
 * 순수 코드포인트(ordinal) 비교. `generatedAt` 은 ISO 8601 타임스탬프라 이미
 * 사전순 == 시간순이지만, `localeCompare()`(인자 없음)는 ICU 로케일 collation
 * 을 써서 환경마다 순서가 달라질 수 있어 최신 sheet 선택이 비결정적이 된다.
 */
function codePointCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export class ResumeSheetReader {
  constructor(private readonly storage: Storage) {}

  async consume(): Promise<ResumeSheet | null> {
    const entries = await this.storage.listFiles(RESUME_SHEET_DIR);
    const candidates = entries.filter(isResumeSheetFilename);
    if (candidates.length === 0) return null;

    const parsed: Array<{ path: string; sheet: ResumeSheet | null }> = [];
    for (const name of candidates) {
      const path = `${RESUME_SHEET_DIR}/${name}`;
      const text = await this.storage.readText(path);
      if (text === null) continue;
      try {
        const data = JSON.parse(text) as ResumeSheet;
        if (data?.version === RESUME_SHEET_VERSION) {
          parsed.push({ path, sheet: data });
        } else {
          parsed.push({ path, sheet: null });
        }
      } catch {
        parsed.push({ path, sheet: null });
      }
    }

    const valid = parsed.filter((p) => p.sheet !== null) as Array<{ path: string; sheet: ResumeSheet }>;
    valid.sort((a, b) => codePointCompare(b.sheet.generatedAt, a.sheet.generatedAt));
    const chosen = valid[0]?.sheet ?? null;

    for (const p of parsed) {
      try {
        await this.storage.delete(p.path);
      } catch {
        // swallow — SessionStart must never fail
      }
    }

    return chosen;
  }
}
