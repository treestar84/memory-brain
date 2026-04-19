export const GOVERNANCE_CONFIG = {
  /** staleAfter가 이만큼 지난 블록을 decay 대상으로 간주 (ms) */
  DECAY_GRACE_MS: 0,
  /** resolved 후 이 기간이 지나면 rotation 대상 (일) */
  ROTATION_DAYS: 90,
  /** decay sweep 시 supersede reason 문자열 */
  DECAY_REASON: "stale-decay",
  /** validation report 저장 경로 */
  VALIDATION_REPORT_PATH: "state/validation-report.json",
} as const;

export const MS_PER_DAY = 24 * 60 * 60 * 1000;
