import type {
  SSLDocument,
  StructuralNode,
  LogicalNode,
  InteractionNode,
  DecisionNode,
} from "../ontology/ssl";

export interface CollectStep {
  kind: "collect";
  sceneId: string;
  sceneGoal: string;
  interactionNode: InteractionNode;
}

export interface BranchStep {
  kind: "branch";
  sceneId: string;
  sceneGoal: string;
  decisionNode: DecisionNode;
}

export interface ExecuteStep {
  kind: "execute";
  sceneId: string;
  sceneGoal: string;
  logicalNodes: LogicalNode[];
  parallel: boolean;
}

export type Step = CollectStep | BranchStep | ExecuteStep;

export interface RunState {
  inputs: Record<string, string>;
  decisions: Record<string, string>;
  completedEffects: string[];
}

export interface RunResult {
  skillSlug: string;
  steps: Step[];
  state: RunState;
}

export class SSLRunner {
  run(doc: SSLDocument): RunResult {
    const ordered = this.sortScenes(doc.structural);
    const steps: Step[] = [];

    for (const scene of ordered) {
      for (const node of doc.interactions ?? []) {
        if (node.scopeRef === scene.id) {
          steps.push({
            kind: "collect",
            sceneId: scene.id,
            sceneGoal: scene.sceneGoal,
            interactionNode: node,
          });
        }
      }

      for (const node of doc.decisions ?? []) {
        if (node.scopeRef === scene.id) {
          steps.push({
            kind: "branch",
            sceneId: scene.id,
            sceneGoal: scene.sceneGoal,
            decisionNode: node,
          });
        }
      }

      const logicalNodes = scene.containsLogicalIds
        .map((lid) => doc.logical.find((l) => l.id === lid))
        .filter((l): l is LogicalNode => l !== undefined);

      if (logicalNodes.length > 0) {
        steps.push({
          kind: "execute",
          sceneId: scene.id,
          sceneGoal: scene.sceneGoal,
          logicalNodes,
          parallel: logicalNodes.length > 1 && this.isParallelSafe(logicalNodes),
        });
      }
    }

    return {
      skillSlug: doc.scheduling.skillName,
      steps,
      state: { inputs: {}, decisions: {}, completedEffects: [] },
    };
  }

  private sortScenes(structural: StructuralNode[]): StructuralNode[] {
    const idMap = new Map(structural.map((s) => [s.id, s]));
    const inDegree = new Map<string, number>(structural.map((s) => [s.id, 0]));

    for (const s of structural) {
      for (const t of s.transitionsTo) {
        inDegree.set(t, (inDegree.get(t) ?? 0) + 1);
      }
    }

    const queue = structural.filter((s) => (inDegree.get(s.id) ?? 0) === 0);
    const result: StructuralNode[] = [];

    while (queue.length > 0) {
      const node = queue.shift()!;
      result.push(node);
      for (const t of node.transitionsTo) {
        const deg = (inDegree.get(t) ?? 1) - 1;
        inDegree.set(t, deg);
        if (deg === 0) {
          const next = idMap.get(t);
          if (next) queue.push(next);
        }
      }
    }

    for (const s of structural) {
      if (!result.find((r) => r.id === s.id)) result.push(s);
    }

    return result;
  }

  private isParallelSafe(nodes: LogicalNode[]): boolean {
    const allEffects = new Set(nodes.flatMap((n) => n.effects));
    for (const n of nodes) {
      if (n.resourceTarget && allEffects.has(n.resourceTarget)) return false;
    }
    return true;
  }
}
