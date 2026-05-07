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
  /**
   * Traverse an SSLDocument and produce an ordered Step[].
   * Precondition: doc must pass validateSSL before being passed here.
   * Dangling transitionsTo IDs or cyclic graphs will throw at runtime.
   */
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

    const resultIds = new Set(result.map((r) => r.id));
    const remaining = structural.filter((s) => !resultIds.has(s.id));
    if (remaining.length > 0) {
      throw new Error(
        `SSLRunner: cycle detected in structural graph. Nodes: ${remaining.map((s) => s.id).join(", ")}`
      );
    }

    return result;
  }

  /**
   * Two nodes are parallel-safe when they all declare distinct, known resourceTargets.
   * Nodes with no resourceTarget are treated as unsafe (unknown = unsafe):
   * without a specific conflict key we cannot rule out resource contention.
   */
  private isParallelSafe(nodes: LogicalNode[]): boolean {
    const targets = nodes.map((n) => n.resourceTarget);
    if (targets.some((t) => !t)) return false;
    return new Set(targets as string[]).size === targets.length;
  }
}
