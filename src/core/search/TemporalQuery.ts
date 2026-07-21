/**
 * TemporalQuery — 결정론 상대시간 파서 (V3.30, LongMemEval 진단 패턴 1·2).
 *
 * "two weeks ago", "last Saturday", "past three months" 같은 상대시간 표현을
 * 기준 시각 (question_date) 대비 [startEpochDay, endEpochDay] 날짜 창으로
 * 변환한다. regex + 정수 날짜 산술만 — LLM 0, 의존성 0.
 *
 * 어휘 매칭에서는 이 표현들이 distractor 를 올리는 노이즈지만 (SearchIndex
 * 의 RELATIVE_TIME_WORDS 가 제거), 날짜 창으로는 1차 변별 신호가 된다.
 * 소비처는 soft filter (창 안 문서 우선 승격) — 파서 오탐 시에도 기존
 * 랭킹으로 수렴해 하방이 제한된다.
 */

export interface TemporalWindow {
  /** epoch day (UTC, ms/86400000 floor) */
  startEpochDay: number;
  endEpochDay: number;
}

const MS_PER_DAY = 86_400_000;

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  few: 3, couple: 2, several: 3,
};

const UNIT_DAYS: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };
// "N units ago" 는 시점 표현 — 단위 절반의 허용폭을 창에 포함 (발화 부정확성)
const UNIT_PAD: Record<string, number> = { day: 1, week: 3, month: 7, year: 30 };

/** "2023/05/30 (Tue) 23:40" / "2023/05/30" → epoch day. 실패 시 null. */
export function parseDateToEpochDay(dateStr: string): number | null {
  const m = /(\d{4})\/(\d{2})\/(\d{2})/.exec(dateStr);
  if (!m) return null;
  const [, y, mo, d] = m;
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d));
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / MS_PER_DAY);
}

function epochDayWeekday(epochDay: number): number {
  // epoch day 0 = 1970-01-01 (Thursday = 4)
  return (((epochDay + 4) % 7) + 7) % 7;
}

function numberOf(word: string): number | null {
  if (/^\d+$/.test(word)) return Number.parseInt(word, 10);
  return NUMBER_WORDS[word] ?? null;
}

/**
 * 질문에서 상대시간 창 추출. 매치 없으면 null.
 * 규칙 (유닛 테스트로 고정):
 * - "N (day|week|month|year)s? ago" → 시점 = ref - N*unit, 창 = 시점 ± pad(unit)
 * - "last <weekday>" → ref 직전의 해당 요일 (오늘 제외), 창 = 그 날 ± 1
 * - "(past|last) N (days|weeks|months)" → [ref - N*unit, ref]
 * - "last week|month|year" → 직전 기간 (달력 아님 — rolling 근사)
 * - "last weekend" → 직전 토요일 기준 [토-1, 일+1]
 * - "yesterday" → [ref-2, ref] / "this week|month" → [ref-7|31, ref]
 */
export function parseTemporalWindow(question: string, referenceDate: string): TemporalWindow | null {
  const ref = parseDateToEpochDay(referenceDate);
  if (ref === null) return null;
  const q = question.toLowerCase();

  // "(past|last) N units" — "N units ago" 보다 먼저 (겹침 방지 아님, 우선순위)
  let m = /(?:past|last|previous)\s+(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|few|couple(?:\s+of)?|several)\s+(day|week|month|year)s?/.exec(q);
  if (m) {
    const n = numberOf(m[1]!.replace(/\s+of$/, "").trim());
    const unit = m[2]!;
    if (n !== null) {
      return { startEpochDay: ref - n * UNIT_DAYS[unit]!, endEpochDay: ref };
    }
  }

  // "N units ago"
  m = /(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|few|couple(?:\s+of)?|several)\s+(day|week|month|year)s?\s+ago/.exec(q);
  if (m) {
    const n = numberOf(m[1]!.replace(/\s+of$/, "").trim());
    const unit = m[2]!;
    if (n !== null) {
      const target = ref - n * UNIT_DAYS[unit]!;
      const pad = UNIT_PAD[unit]!;
      return { startEpochDay: target - pad, endEpochDay: target + pad };
    }
  }

  // "last <weekday>" — 화이트리스트 매치만 ("last name" 오탐 차단)
  m = /last\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/.exec(q);
  if (m) {
    const target = WEEKDAYS.indexOf(m[1] as (typeof WEEKDAYS)[number]);
    const refDow = epochDayWeekday(ref);
    let back = refDow - target;
    if (back <= 0) back += 7; // 오늘이 그 요일이어도 "지난" = 직전 주
    const day = ref - back;
    return { startEpochDay: day - 1, endEpochDay: day + 1 };
  }

  // "last weekend"
  if (/last\s+weekend/.test(q)) {
    const refDow = epochDayWeekday(ref);
    let back = refDow - 6; // saturday = 6
    if (back <= 0) back += 7;
    const sat = ref - back;
    return { startEpochDay: sat - 1, endEpochDay: sat + 2 };
  }

  // "last week|month|year" (rolling 근사 — 달력 경계 미사용)
  m = /last\s+(week|month|year)\b/.exec(q);
  if (m) {
    const unit = m[1]!;
    const len = UNIT_DAYS[unit]!;
    return { startEpochDay: ref - 2 * len, endEpochDay: ref - Math.floor(len / 2) };
  }

  if (/\byesterday\b/.test(q)) {
    return { startEpochDay: ref - 2, endEpochDay: ref };
  }

  m = /this\s+(week|month)\b/.exec(q);
  if (m) {
    return { startEpochDay: ref - (m[1] === "week" ? 7 : 31), endEpochDay: ref };
  }

  return null;
}

export function hasTemporalIntent(question: string): boolean {
  // referenceDate 무관 — 패턴 존재 여부만. 임의 기준일로 파서 재사용.
  return parseTemporalWindow(question, "2000/01/15") !== null;
}
