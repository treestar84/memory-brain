import { STRUCTURAL_DETECTOR_IDS, type DetectorId, type QuestionLifecycle } from "./types";

const LIFECYCLES: QuestionLifecycle[] = ["pending", "asked", "answered", "stale"];

export function isStructuralDetectorId(v: unknown): boolean {
  return typeof v === "string" && (STRUCTURAL_DETECTOR_IDS as readonly string[]).includes(v);
}

export function isDetectorId(v: unknown): v is DetectorId {
  return isStructuralDetectorId(v) || v === "semantic";
}

export function isQuestionLifecycle(v: unknown): v is QuestionLifecycle {
  return typeof v === "string" && LIFECYCLES.includes(v as QuestionLifecycle);
}
