import { stringify } from "yaml";
import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import type { OntologyModuleData } from "./types";
import { OntologyModule } from "./OntologyModule";

export class PromotionEngine {
  constructor(
    private readonly ontologyModule: OntologyModule,
    private readonly userStorage: Storage,
    private readonly clock: Clock,
    private readonly minResolvedRuns = 3,
  ) {}

  async maybePromote(module: OntologyModuleData): Promise<boolean> {
    if (module.resolvedRuns < this.minResolvedRuns) return false;
    if (module.promotedAt !== null) return false;

    const promotedAt = this.clock.isoNow();
    const promoted: OntologyModuleData = { ...module, promotedAt };
    const path = `ontologies/promoted/${module.templateId}/${module.problemId}.yaml`;
    await this.userStorage.writeRaw(path, stringify(promoted));
    await this.ontologyModule.markPromoted(module.problemId, promotedAt);
    return true;
  }
}
