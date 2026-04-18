import { parse } from "yaml";
import type { Storage } from "../storage/Storage";
import type { FlowTemplate } from "./types";

export class TemplateRegistry {
  constructor(private readonly storage: Storage) {}

  async loadAll(): Promise<FlowTemplate[]> {
    const files = await this.storage.listFiles("flow-patterns", "*.yaml");
    const templates: FlowTemplate[] = [];
    for (const file of files) {
      const content = await this.storage.readText(`flow-patterns/${file}`);
      if (!content) continue;
      templates.push(parse(content) as FlowTemplate);
    }
    return templates;
  }

  async get(templateId: string): Promise<FlowTemplate | null> {
    const content = await this.storage.readText(`flow-patterns/${templateId}.yaml`);
    if (!content) return null;
    return parse(content) as FlowTemplate;
  }

  async listIds(): Promise<string[]> {
    const files = await this.storage.listFiles("flow-patterns", "*.yaml");
    return files.map((f) => f.replace(/\.yaml$/, ""));
  }
}
