/**
 * frontmatter 파싱 공용 유틸 (호환성 수정).
 *
 * 여러 모듈이 각자 `/^---\n([\s\S]*?)\n---\n.../` 정규식을 복제했는데, CRLF
 * (`\r\n`) 로 저장된 파일에서는 매치가 실패해 canonical wiki page 가 조용히
 * `type: "note"` 로 강등되는 문제가 있었다. `\r?\n` 로 개행을 통일하고, 파싱
 * 진입점에서 선두 BOM(U+FEFF) 을 제거한다.
 */

/** frontmatter 구분자(`---`) — group1: YAML 블록, group2: 본문. CRLF/트레일링 개행 유무 모두 허용. */
export const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** 선두 UTF-8 BOM(U+FEFF) 제거 — 없으면 원문 그대로. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** frontmatter YAML 블록 내 CRLF 잔존 `\r` 제거 — yaml.parse 에 넘기기 전에 적용. */
export function normalizeYamlBlock(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\r/g, "");
}
