import { DuplicateCandidatesDetector } from "./DuplicateCandidatesDetector";
import { StaleClaimsDetector } from "./StaleClaimsDetector";
import { ContradictionsDetector } from "./ContradictionsDetector";
import { LowConfidenceDetector } from "./LowConfidenceDetector";
import { ReviewQueueDetector } from "./ReviewQueueDetector";
import type { DetectorReport, GovernanceDetector, GovernanceInput } from "./types";

/**
 * 표준 5-detector 세트 (duplicate/stale/contradiction/low-confidence/review-queue).
 * `cfgm governance-report`(report 파일 기록)와 `cfgm doctor`(읽기 전용 카운트 체크)
 * 양쪽이 이 실행 로직을 공유한다 — 어느 쪽도 이 함수 자체에서 파일을 쓰지 않는다.
 */
export function runGovernanceDetectors(input: GovernanceInput): DetectorReport[] {
  const detectors: GovernanceDetector[] = [
    new DuplicateCandidatesDetector(),
    new StaleClaimsDetector(),
    new ContradictionsDetector(),
    new LowConfidenceDetector(),
    new ReviewQueueDetector(),
  ];
  return detectors.map((d) => d.detect(input));
}
