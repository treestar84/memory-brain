export const GOVERNANCE_CONFIG = {
  /** staleAfter가 이만큼 지난 블록을 decay 대상으로 간주 (ms) */
  DECAY_GRACE_MS: 0,
  /** resolved 후 이 기간이 지나면 rotation 대상 (일) */
  ROTATION_DAYS: 90,
  /** decay sweep 시 supersede reason 문자열 */
  DECAY_REASON: "stale-decay",
  /** validation report 저장 경로 */
  VALIDATION_REPORT_PATH: "state/validation-report.json",
  /** wiki page age(일) 가 이 값을 넘으면 aging 후보 (status: active) */
  WIKI_AGING_DAYS: 45,
  /** wiki page age(일) 가 이 값을 넘고 최근 회상 0회면 decay-candidate (status: active) */
  WIKI_STALE_DAYS: 90,
  /** draft 상태 page age(일) 가 이 값을 넘으면 stale-draft */
  WIKI_DRAFT_STALE_DAYS: 14,
  /** 회상 여부 판정 시 조회하는 최근 기간(일) */
  WIKI_RECALL_WINDOW_DAYS: 30,
} as const;

export const MS_PER_DAY = 24 * 60 * 60 * 1000;
