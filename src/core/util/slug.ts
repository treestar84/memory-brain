/**
 * slug 생성 공용 유틸 (호환성 수정).
 *
 * 기존엔 파일마다 `[^a-zA-Z0-9_-]+` → `-` 패턴을 복제해 한글(가-힣) 파일명이
 * 전부 "-" 또는 폴백으로 붕괴하는 버그가 있었다 — 서로 다른 기억이 같은 파일을
 * 덮어쓰는 데이터 유실로 이어진다. 한글은 모든 주요 OS 파일명에서 안전하므로
 * slug 문자셋에 보존한다. 이 모듈이 단일 source-of-truth — 호출처는 이 함수를
 * import 해서 쓴다(중복 정규식 제거).
 */

const RESERVED_NAMES: ReadonlySet<string> = new Set([
  "con", "prn", "aux", "nul",
  "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
  "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
]);

/** 한글은 UTF-8 3바이트 — 255바이트 파일명 한계에 여유를 두는 문자 수 상한. */
export const MAX_SLUG_CHARS = 80;

/** 길이 상한으로 절단 — 서로게이트/멀티바이트 문자 단위(code point)로 자르고, 끝에 남는 dash 를 정리한다. */
export function capSlugLength(slug: string, maxChars: number = MAX_SLUG_CHARS): string {
  const chars = [...slug];
  if (chars.length <= maxChars) return slug;
  const cut = chars.slice(0, maxChars).join("").replace(/-+$/, "");
  return cut.length > 0 ? cut : chars.slice(0, maxChars).join("");
}

/** Windows 예약 파일명(대소문자 무관: CON/PRN/AUX/NUL/COM1-9/LPT1-9)과 충돌하면 접미사를 붙인다. */
export function guardReservedName(slug: string): string {
  return RESERVED_NAMES.has(slug.toLowerCase()) ? `${slug}-x` : slug;
}

/**
 * 임의 문자열 → 파일명으로 안전한 slug 로 변환.
 * 영문/숫자/한글(가-힣)/`_`/`-` 만 허용 — 그 외 연속 문자는 단일 `-` 로 치환,
 * 선행/후행 dash 제거, 소문자화. 결과가 비면(순수 특수문자·빈 문자열 등)
 * `fallback` 을 대신 쓴다. 길이 상한과 Windows 예약어 충돌도 여기서 처리한다.
 */
export function slugify(input: string, fallback: string = "unnamed"): string {
  let slug = input
    .replace(/[^a-zA-Z0-9가-힣_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  if (slug.length === 0) slug = fallback;
  slug = capSlugLength(slug);
  if (slug.length === 0) slug = fallback;
  return guardReservedName(slug);
}
