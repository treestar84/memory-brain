import { describe, test, expect, beforeEach } from "bun:test";
import { TemplateRegistry } from "../../../src/core/ontology/TemplateRegistry";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { stringify } from "yaml";
import type { FlowTemplate } from "../../../src/core/ontology/types";

const bugfixTemplate: FlowTemplate = {
  id: "bugfix",
  version: "1.0.0",
  description: "버그 수정",
  requiredBlockTypes: ["Action", "Outcome"],
  recommendedBlockTypes: ["Cause", "Evidence"],
  expectedRelations: [{ from: "Action", to: "Outcome", kind: "followsFrom" }],
  minConfidence: 0.6,
};

const archTemplate: FlowTemplate = {
  id: "architecture",
  version: "1.0.0",
  description: "아키텍처 결정",
  requiredBlockTypes: ["Context", "Action"],
  recommendedBlockTypes: ["Constraint"],
  expectedRelations: [],
  minConfidence: 0.65,
};

describe("TemplateRegistry", () => {
  let storage: MemoryStorage;
  let registry: TemplateRegistry;

  beforeEach(async () => {
    storage = new MemoryStorage();
    await storage.writeRaw("flow-patterns/bugfix.yaml", stringify(bugfixTemplate));
    await storage.writeRaw("flow-patterns/architecture.yaml", stringify(archTemplate));
    registry = new TemplateRegistry(storage);
  });

  test("loadAll returns all seeded templates", async () => {
    const all = await registry.loadAll();
    expect(all).toHaveLength(2);
    expect(all.map((t) => t.id).sort()).toEqual(["architecture", "bugfix"]);
  });

  test("get(id) returns matching template", async () => {
    const t = await registry.get("bugfix");
    expect(t?.id).toBe("bugfix");
    expect(t?.requiredBlockTypes).toEqual(["Action", "Outcome"]);
  });

  test("get(missing) returns null", async () => {
    const t = await registry.get("nonexistent");
    expect(t).toBeNull();
  });

  test("listIds returns all ids", async () => {
    const ids = await registry.listIds();
    expect(ids.sort()).toEqual(["architecture", "bugfix"]);
  });

  test("loadAll on empty storage returns empty array", async () => {
    const empty = new TemplateRegistry(new MemoryStorage());
    expect(await empty.loadAll()).toEqual([]);
  });
});
