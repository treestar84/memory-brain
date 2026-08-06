import { rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

/**
 * 임시 파일에 쓴 뒤 rename — POSIX 에서 원자적이다(부분 쓰기 상태로 관찰되지
 * 않음). git 추적 canonical 파일(wiki page, SKILL.md 등)에 직접 `writeFile`
 * 하면 쓰는 도중 프로세스가 죽었을 때(OOM·강제종료·디스크풀) 파일이 잘린 채로
 * 남을 수 있다 — V3.43 에서 발견, 이 함수로 교체.
 */
export async function writeFileAtomic(path: string, content: string): Promise<void> {
  const tmp = `${path}.tmp.${randomUUID().slice(0, 8)}`;
  await writeFile(tmp, content, "utf-8");
  await renameWithRetry(tmp, path);
}

const RETRYABLE_RENAME_CODES: ReadonlySet<string> = new Set(["EPERM", "EBUSY", "EACCES"]);
const RENAME_RETRY_DELAYS_MS = [10, 50, 250];

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

/**
 * `rename()` 래퍼 — Windows 에서 대상 파일이 다른 프로세스(백신, 인덱서 등)에
 * 열려 있으면 rename-over-existing 이 EPERM/EBUSY/EACCES 로 실패할 수 있다.
 * win32 에서만 지수 백오프(10/50/250ms) 로 최대 3회 재시도한다 — POSIX 는
 * 재시도 경로를 아예 타지 않으므로 기존 동작과 완전히 동일하다.
 */
export async function renameWithRetry(src: string, dest: string): Promise<void> {
  if (process.platform !== "win32") {
    await rename(src, dest);
    return;
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt <= RENAME_RETRY_DELAYS_MS.length; attempt++) {
    try {
      await rename(src, dest);
      return;
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (!code || !RETRYABLE_RENAME_CODES.has(code) || attempt === RENAME_RETRY_DELAYS_MS.length) {
        throw e;
      }
      lastErr = e;
      await sleep(RENAME_RETRY_DELAYS_MS[attempt]!);
    }
  }
  throw lastErr;
}
