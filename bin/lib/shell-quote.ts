/**
 * settings.json 의 hook `command` 문자열에 경로를 끼워 넣을 때 쓰는 셸 인용 유틸.
 *
 * settings.json 은 머신 로컬 파일이라, 이 인용은 "지금 이 스크립트를 실행 중인 플랫폼"
 * 기준으로 하면 된다(파일을 다른 OS 로 옮겨 쓰는 경우는 지원 범위 밖).
 *
 * - POSIX (bash/zsh/sh): 작은따옴표로 감싸고, 내부 `'` 는 `'\''` 로 이스케이프.
 * - Windows (cmd.exe): 작은따옴표는 인용으로 취급되지 않으므로 큰따옴표로 감싼다.
 *   내부 `"` 는 `\"` 로, 문자열이 `\` 로 끝나면 그 끝 `\` 는 `\\` 로 이스케이프한다.
 */
export function shQuote(s: string, platform: NodeJS.Platform = process.platform): string {
  if (platform === "win32") {
    const escaped = s.replace(/"/g, '\\"').replace(/\\$/, "\\\\");
    return `"${escaped}"`;
  }
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
