import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const MEMORY_SUBDIRS = ["concepts", "decisions", "projects"];

/**
 * estimateTokens — 텍스트 길이 기반 토큰 수 추정치.
 *
 * 정밀 tokenizer(예: tiktoken) 는 의존성 0 원칙(docs/RULES.md) 위반이므로 도입하지 않는다.
 * 대신 널리 쓰이는 경험칙 "영문 기준 문자 4개 ≈ 토큰 1개" 를 그대로 사용한다.
 * 실제 tokenizer 대비 오차가 있을 수 있는 **추정치**임을 호출측(UI/CLI 출력)에서 항상 명시해야 한다.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * estimateMemoryCorpusTokens — memory/{concepts,decisions,projects} 전체를
 * 통째로 주입했다면 소요됐을 토큰 수 추정치 (파일 크기 합 기반).
 *
 * `_` 로 시작하는 하위 디렉토리(_archive, _ssl, _pending 등)는 canonical wiki 가
 * 아니므로 제외한다. memoryDir 자체가 없으면 0 을 반환한다 (에러 아님).
 */
export async function estimateMemoryCorpusTokens(memoryDir: string): Promise<number> {
  let totalBytes = 0;

  for (const sub of MEMORY_SUBDIRS) {
    totalBytes += await sumMarkdownBytes(join(memoryDir, sub));
  }

  return Math.ceil(totalBytes / 4);
}

async function sumMarkdownBytes(dir: string): Promise<number> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }

  let bytes = 0;
  for (const entry of entries) {
    if (entry.name.startsWith("_")) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      bytes += await sumMarkdownBytes(fullPath);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      try {
        const s = await stat(fullPath);
        bytes += s.size;
      } catch {
        // 경합 중 파일이 사라진 경우 등 — 무시하고 계속.
      }
    }
  }
  return bytes;
}
