import { parse } from "yaml";
import type { Storage } from "../storage/Storage";
import type { FlowTemplate } from "./types";

export class TemplateRegistry {
  constructor(private readonly storage: Storage) {}

  async loadAll(): Promise<FlowTemplate[]> {
    const files = await this.storage.listFiles("flow-patterns", "*.yaml");
    const templates: FlowTemplate[] = [];
    for (const file of files) {
      let content: string | null;
      try {
        content = await this.storage.readText(`flow-patterns/${file}`);
      } catch {
        continue;
      }
      if (!content) continue;
      const parsed = parse(content);
      if (!parsed || typeof (parsed as { id?: unknown }).id !== "string") continue;
      templates.push(parsed as FlowTemplate);
    }
    return templates;
  }

  async get(templateId: string): Promise<FlowTemplate | null> {
    const content = await this.storage.readText(`flow-patterns/${templateId}.yaml`);
    if (!content) return null;
    const parsed = parse(content);
    if (!parsed || typeof (parsed as { id?: unknown }).id !== "string") return null;
    return parsed as FlowTemplate;
  }

  async listIds(): Promise<string[]> {
    const files = await this.storage.listFiles("flow-patterns", "*.yaml");
    return files.map((f) => f.replace(/\.yaml$/, ""));
  }
}
