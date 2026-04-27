import { RequestClassifier } from "./RequestClassifier";
import { LaneSelector } from "./LaneSelector";
import type { RouteDecision } from "./types";

/**
 * Memory Router facade (PR-V3.3, vision §6.3).
 *
 * 사용자 발화 텍스트 → ClassificationResult → LaneSelectionResult → 1쪽 요약.
 * UserPromptSubmit hook 에서 호출. ContextBudget 은 별도 인스턴스로 라우팅
 * 사이클별 사용 (Router 가 직접 보유 안 함 — 라우팅 결정과 budget 강제는 분리).
 */
export class Router {
  constructor(
    private readonly classifier: RequestClassifier = new RequestClassifier(),
    private readonly selector: LaneSelector = new LaneSelector(),
  ) {}

  decide(text: string): RouteDecision {
    const classification = this.classifier.classify(text);
    const selection = this.selector.select(classification.categories);
    const summary = this.summarize(classification, selection);
    return { classification, selection, summary };
  }

  private summarize(
    classification: RouteDecision["classification"],
    selection: RouteDecision["selection"],
  ): string {
    const cats = classification.categories.join(",");
    const lanes = selection.lanes.length > 0 ? selection.lanes.join(",") : "(no lanes)";
    return `route: [${cats}] → lanes: ${lanes}`;
  }
}
