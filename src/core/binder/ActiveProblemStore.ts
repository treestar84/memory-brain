import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import type { OntologyModule } from "../ontology/OntologyModule";
import { randomUUID } from "node:crypto";

export type ProblemStatus = "active" | "resolved" | "archived";

export type Problem = {
  id: string;
  title: string;
  slug: string;
  status: ProblemStatus;
  createdAt: string;
  lastConfirmedAt: string;
  resolvedAt: string | null;
};

type StoredProblem = Partial<Problem> & {
  id: string;
  title: string;
  slug: string;
  createdAt: string;
  lastConfirmedAt: string;
};

type ActiveState = {
  activeId: string | null;
  problems: StoredProblem[];
};

const STATE_PATH = "state/active-problem.json";

function hydrate(p: StoredProblem): Problem {
  return {
    ...p,
    status: p.status ?? "active",
    resolvedAt: p.resolvedAt ?? null,
  };
}

export class ActiveProblemStore {
  constructor(
    private readonly storage: Storage,
    private readonly clock: Clock,
    private readonly ontologyModule?: OntologyModule
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
    const found = state.problems.find((p) => p.id === state.activeId);
    if (!found) return null;
    const problem = hydrate(found);
    if (problem.status !== "active") return null;
    return problem;
  }

  async create(title: string, slug: string, templateId = "general-task"): Promise<Problem> {
    const state = await this.load();
    const problem: Problem = {
      id: `prob-${randomUUID().slice(0, 8)}`,
      title,
      slug,
      status: "active",
      createdAt: this.clock.isoNow(),
      lastConfirmedAt: this.clock.isoNow(),
      resolvedAt: null,
    };
    state.problems.push(problem);
    state.activeId = problem.id;
    await this.save(state);
    await this.ontologyModule?.create(problem.id, templateId, "1.0.0");
    return problem;
  }

  async resolveProblem(problemId: string): Promise<Problem> {
    const state = await this.load();
    const found = state.problems.find((p) => p.id === problemId);
    if (!found) throw new Error(`Problem not found: ${problemId}`);
    found.status = "resolved";
    found.resolvedAt = this.clock.isoNow();
    if (state.activeId === problemId) state.activeId = null;
    await this.save(state);
    return hydrate(found);
  }

  async archiveProblem(problemId: string): Promise<Problem> {
    const state = await this.load();
    const found = state.problems.find((p) => p.id === problemId);
    if (!found) throw new Error(`Problem not found: ${problemId}`);
    found.status = "archived";
    if (state.activeId === problemId) state.activeId = null;
    await this.save(state);
    return hydrate(found);
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
    return state.problems.map(hydrate);
  }

  async listResolved(): Promise<Problem[]> {
    const state = await this.load();
    return state.problems.map(hydrate).filter((p) => p.status === "resolved");
  }

  async listAll(): Promise<Problem[]> {
    const state = await this.load();
    return state.problems.map(hydrate);
  }

  async getSummary(): Promise<string> {
    const active = await this.getActive();
    if (!active) return "활성 문제 없음";
    return `**문제:** ${active.title} (\`${active.slug}\`)\n확인: ${active.lastConfirmedAt}`;
  }
}
