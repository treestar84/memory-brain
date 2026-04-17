import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import type { FlowDelta, FlowGraph } from "./types";

export class FlowGraphStore {
  constructor(private readonly storage: Storage, private readonly clock: Clock) {}

  private deltaPath(problemId: string): string {
    return `problems/${problemId}/flow-delta.jsonl`;
  }

  private snapshotPath(problemId: string): string {
    return `problems/${problemId}/flow-graph.json`;
  }

  async appendDelta(problemId: string, delta: FlowDelta): Promise<void> {
    await this.storage.appendJsonl(this.deltaPath(problemId), delta);
  }

  async readDeltas(problemId: string, since?: string): Promise<FlowDelta[]> {
    const all = await this.storage.readJsonl<FlowDelta>(this.deltaPath(problemId));
    if (!since) return all;
    return all.filter(d => d.timestampIso >= since);
  }

  async writeSnapshot(problemId: string, graph: FlowGraph): Promise<void> {
    await this.storage.writeJsonAtomic(this.snapshotPath(problemId), graph);
  }

  async readSnapshot(problemId: string): Promise<FlowGraph | null> {
    return this.storage.readJson<FlowGraph>(this.snapshotPath(problemId));
  }
}
