import { parse, stringify } from "yaml";
import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import type { OntologyModuleData } from "./types";

export class OntologyModule {
  constructor(
    private readonly storage: Storage,
    private readonly clock: Clock,
  ) {}

  private path(problemId: string): string {
    return `problems/${problemId}/ontology.module.yaml`;
  }

  async read(problemId: string): Promise<OntologyModuleData | null> {
    const content = await this.storage.readText(this.path(problemId));
    if (!content) return null;
    return parse(content) as OntologyModuleData;
  }

  async create(
    problemId: string,
    templateId: string,
    templateVersion: string,
  ): Promise<OntologyModuleData> {
    const now = this.clock.isoNow();
    const data: OntologyModuleData = {
      problemId,
      templateId,
      templateVersion,
      resolvedRuns: 0,
      createdAt: now,
      lastUpdatedAt: now,
      observedPatterns: {},
      promotedAt: null,
    };
    await this.storage.writeRaw(this.path(problemId), stringify(data));
    return data;
  }

  async recordPatterns(
    problemId: string,
    blockTypeCounts: Record<string, number>,
  ): Promise<OntologyModuleData> {
    const existing = await this.read(problemId);
    if (!existing) throw new Error(`ontology module not found: ${problemId}`);
    const merged: Record<string, number> = { ...existing.observedPatterns };
    for (const [type, count] of Object.entries(blockTypeCounts)) {
      merged[type] = (merged[type] ?? 0) + count;
    }
    const updated: OntologyModuleData = {
      ...existing,
      observedPatterns: merged,
      lastUpdatedAt: this.clock.isoNow(),
    };
    await this.storage.writeRaw(this.path(problemId), stringify(updated));
    return updated;
  }

  async incrementResolvedRuns(problemId: string): Promise<OntologyModuleData> {
    const existing = await this.read(problemId);
    if (!existing) throw new Error(`ontology module not found: ${problemId}`);
    const updated: OntologyModuleData = {
      ...existing,
      resolvedRuns: existing.resolvedRuns + 1,
      lastUpdatedAt: this.clock.isoNow(),
    };
    await this.storage.writeRaw(this.path(problemId), stringify(updated));
    return updated;
  }

  async markPromoted(problemId: string, promotedAt: string): Promise<OntologyModuleData> {
    const existing = await this.read(problemId);
    if (!existing) throw new Error(`ontology module not found: ${problemId}`);
    const updated: OntologyModuleData = {
      ...existing,
      promotedAt,
      lastUpdatedAt: this.clock.isoNow(),
    };
    await this.storage.writeRaw(this.path(problemId), stringify(updated));
    return updated;
  }
}
