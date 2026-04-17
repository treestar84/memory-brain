import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import { randomUUID } from "node:crypto";

export type Problem = {
  id: string;
  title: string;
  slug: string;
  createdAt: string;
  lastConfirmedAt: string;
};

type ActiveState = {
  activeId: string | null;
  problems: Problem[];
};

const STATE_PATH = "state/active-problem.json";

export class ActiveProblemStore {
  constructor(
    private readonly storage: Storage,
    private readonly clock: Clock
  ) {}

  private async load(): Promise<ActiveState> {
    const data = await this.storage.readJson<ActiveState>(STATE_PATH);
    return data ?? { activeId: null, problems: [] };
  }

  private async save(state: ActiveState): Promise<void> {
    await this.storage.writeJsonAtomic(STATE_PATH, state);
  }

  async getActive(): Promise<Problem | null> {
    const state = await this.load();
    if (!state.activeId) return null;
    return state.problems.find((p) => p.id === state.activeId) ?? null;
  }

  async create(title: string, slug: string): Promise<Problem> {
    const state = await this.load();
    const problem: Problem = {
      id: `prob-${randomUUID().slice(0, 8)}`,
      title,
      slug,
      createdAt: this.clock.isoNow(),
      lastConfirmedAt: this.clock.isoNow(),
    };
    state.problems.push(problem);
    state.activeId = problem.id;
    await this.save(state);
    return problem;
  }

  async switchTo(problemId: string): Promise<void> {
    const state = await this.load();
    const found = state.problems.find((p) => p.id === problemId);
    if (!found) throw new Error(`Problem not found: ${problemId}`);
    state.activeId = problemId;
    found.lastConfirmedAt = this.clock.isoNow();
    await this.save(state);
  }

  async updateLastConfirmed(): Promise<void> {
    const state = await this.load();
    if (!state.activeId) return;
    const active = state.problems.find((p) => p.id === state.activeId);
    if (active) {
      active.lastConfirmedAt = this.clock.isoNow();
      await this.save(state);
    }
  }

  async getHistory(): Promise<Problem[]> {
    const state = await this.load();
    return state.problems;
  }

  async getSummary(): Promise<string> {
    const active = await this.getActive();
    if (!active) return "활성 문제 없음";
    return `**문제:** ${active.title} (\`${active.slug}\`)\n확인: ${active.lastConfirmedAt}`;
  }
}
