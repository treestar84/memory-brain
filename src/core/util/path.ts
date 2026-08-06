/**
 * 경로 정규화 공용 유틸 (호환성 수정).
 *
 * `Bun.Glob.scan()` 은 Windows 에서 `\` 구분 경로를 반환할 수 있다 — `/` 기준
 * split/endsWith 로직(예: `_` 프리픽스 서브디렉토리 제외)이 무력화되는 문제가
 * 있었다. scan 결과는 이 함수로 정규화한 뒤 기존 `/` 기준 로직을 그대로 쓴다.
 */
export function toPosixPath(p: string): string {
  return p.replaceAll("\\", "/");
}
