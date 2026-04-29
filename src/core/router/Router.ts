import { RequestClassifier } from "./RequestClassifier";
import { LaneSelector } from "./LaneSelector";
import { RouterMappings } from "./RouterMappings";
import type { RouteDecision } from "./types";

/**
 * Memory Router facade (PR-V3.3, vision §6.3).
 *
 * 사용자 발화 텍스트 → ClassificationResult → LaneSelectionResult →
 * RouterMappings 결과 (PR-V3.10) → 1쪽 요약.
 * UserPromptSubmit hook 에서 호출.
 */
export class Router {
  constructor(
    private readonly classifier: RequestClassifier = new RequestClassifier(),
    private readonly selector: LaneSelector = new LaneSelector(),
    private readonly mappings: RouterMappings = new RouterMappings(),
  ) {}

  decide(text: string): RouteDecision {
    const classification = this.classifier.classify(text);
    const selection = this.selector.select(classification.categories);
    const resolution = this.mappings.resolve(text);
    const mapping =
      resolution.files.length > 0 || resolution.matchedRules.length > 0
        ? { files: resolution.files, matchedRules: resolution.matchedRules }
        : undefined;
    const summary = this.summarize(classification, selection, mapping);
    return { classification, selection, mapping, summary };
  }

  private summarize(
    classification: RouteDecision["classification"],
    selection: RouteDecision["selection"],
    mapping: RouteDecision["mapping"],
  ): string {
    const cats = classification.categories.join(",");
    const lanes = selection.lanes.length > 0 ? selection.lanes.join(",") : "(no lanes)";
    let line = `route: [${cats}] → lanes: ${lanes}`;
    if (mapping && mapping.files.length > 0) {
      const files = mapping.files.slice(0, 5).join(", ");
      const more = mapping.files.length > 5 ? ` (+${mapping.files.length - 5})` : "";
      line += ` → files: ${files}${more}`;
    }
    return line;
  }
}
