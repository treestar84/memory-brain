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
  await rename(tmp, path);
}
