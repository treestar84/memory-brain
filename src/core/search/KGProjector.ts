import type { SSLDocument } from "../ontology/ssl";

export type KGNodeType =
  | "scheduling"
  | "structural"
  | "logical"
  | "decision"
  | "interaction"
  | "evidence"
  | "protocol"
  | "canonical_action";

export interface KGNode {
  nodeId: string;
  nodeType: KGNodeType;
  skillSlug: string;
  scene?: string;   // structural 일 때만
  action?: string;  // logical 일 때만
  label: string;    // 사람 읽기용 짧은 식별자
  properties: string; // JSON.stringify(원본 노드) — lossless
}

export type KGRelation =
  | "CONTAINS"            // structural → logical
  | "TRANSITIONS_TO"      // structural → structural
  | "INSTANTIATES"        // logical → canonical_action
  | "DELEGATES_TO"        // protocol → other skill scheduling node
  | "SCOPED_TO"           // decision/interaction/evidence/protocol → structural|logical
  | "REFERENCES_EVIDENCE"; // logical → claim (외부)

export interface KGEdge {
  fromId: string;
  toId: string;
  relation: KGRelation;
  fromSkill: string;
  toSkill: string | null; // resolve 결과 (cross-skill이면 대상 slug, null이면 dangling)
  resolved: boolean;      // false if dangling
  properties?: string;    // JSON (whenCondition, weight 등)
}

/** scheduling.id 에서 slug 추출 (e.g. "my-skill#scheduling" → "my-skill") */
export function extractSlug(doc: SSLDocument): string {
  const rawId = doc.scheduling.id;
  if (rawId && rawId.includes("#")) {
    return rawId.split("#")[0];
  }
  return doc.scheduling.skillName.toLowerCase().replace(/\s+/g, "-");
}

export class KGProjector {
  /**
   * Phase 1 — 단일 SSLDocument에서 노드/엣지 추출.
   * cross-skill resolve (DELEGATES_TO target) 는 Phase 2에서.
   */
  projectDocument(doc: SSLDocument): { nodes: KGNode[]; edges: KGEdge[] } {
    const nodes: KGNode[] = [];
    const edges: KGEdge[] = [];
    const slug = extractSlug(doc);

    // Scheduling 노드
    nodes.push({
      nodeId: doc.scheduling.id,
      nodeType: "scheduling",
      skillSlug: slug,
      label: doc.scheduling.skillName,
      properties: JSON.stringify(doc.scheduling),
    });

    // Structural 노드
    for (let i = 0; i < doc.structural.length; i++) {
      const s = doc.structural[i];
      const nodeId = s.id;
      nodes.push({
        nodeId,
        nodeType: "structural",
        skillSlug: slug,
        scene: s.scene,
        label: `${slug}/${s.scene}`,
        properties: JSON.stringify(s),
      });

      // CONTAINS 엣지: structural → logical
      for (const lid of s.containsLogicalIds) {
        edges.push({
          fromId: nodeId,
          toId: lid,
          relation: "CONTAINS",
          fromSkill: slug,
          toSkill: slug,
          resolved: true,
        });
      }

      // TRANSITIONS_TO 엣지: structural → structural
      for (const tid of s.transitionsTo) {
        edges.push({
          fromId: nodeId,
          toId: tid,
          relation: "TRANSITIONS_TO",
          fromSkill: slug,
          toSkill: slug,
          resolved: true,
        });
      }
    }

    // Logical 노드
    for (const l of doc.logical) {
      nodes.push({
        nodeId: l.id,
        nodeType: "logical",
        skillSlug: slug,
        action: l.action,
        label: `${l.action}@${slug}`,
        properties: JSON.stringify(l),
      });

      // INSTANTIATES 엣지: logical → canonical_action
      if (l.actionRef) {
        const canonicalId = `canonical_action:${l.actionRef}`;
        // canonical_action 가상 노드 (중복 방지는 Phase 1 caller 몫)
        nodes.push({
          nodeId: canonicalId,
          nodeType: "canonical_action",
          skillSlug: slug,
          label: l.actionRef,
          properties: JSON.stringify({ actionRef: l.actionRef }),
        });
        edges.push({
          fromId: l.id,
          toId: canonicalId,
          relation: "INSTANTIATES",
          fromSkill: slug,
          toSkill: null,
          resolved: true,
        });
      }

      // REFERENCES_EVIDENCE 엣지: logical → claim
      for (const claimId of l.evidenceClaimIds) {
        edges.push({
          fromId: l.id,
          toId: claimId,
          relation: "REFERENCES_EVIDENCE",
          fromSkill: slug,
          toSkill: null,
          resolved: true,
        });
      }
    }

    // Decision 노드
    for (const d of doc.decisions ?? []) {
      nodes.push({
        nodeId: d.id,
        nodeType: "decision",
        skillSlug: slug,
        label: d.question.slice(0, 60),
        properties: JSON.stringify(d),
      });
      if (d.scopeRef) {
        edges.push({
          fromId: d.id,
          toId: d.scopeRef,
          relation: "SCOPED_TO",
          fromSkill: slug,
          toSkill: slug,
          resolved: true,
        });
      }
    }

    // Interaction 노드
    for (const inter of doc.interactions ?? []) {
      nodes.push({
        nodeId: inter.id,
        nodeType: "interaction",
        skillSlug: slug,
        label: inter.prompt.slice(0, 60),
        properties: JSON.stringify(inter),
      });
      if (inter.scopeRef) {
        edges.push({
          fromId: inter.id,
          toId: inter.scopeRef,
          relation: "SCOPED_TO",
          fromSkill: slug,
          toSkill: slug,
          resolved: true,
        });
      }
    }

    // Evidence 노드
    for (const ev of doc.evidence ?? []) {
      nodes.push({
        nodeId: ev.id,
        nodeType: "evidence",
        skillSlug: slug,
        label: ev.caseLabel,
        properties: JSON.stringify(ev),
      });
      if (ev.scopeRef) {
        edges.push({
          fromId: ev.id,
          toId: ev.scopeRef,
          relation: "SCOPED_TO",
          fromSkill: slug,
          toSkill: slug,
          resolved: true,
        });
      }
    }

    // Protocol 노드
    for (const proto of doc.protocols ?? []) {
      nodes.push({
        nodeId: proto.id,
        nodeType: "protocol",
        skillSlug: slug,
        label: `delegate→${proto.delegateTo}`,
        properties: JSON.stringify(proto),
      });

      // DELEGATES_TO 엣지: protocol → <targetSlug>#scheduling
      // resolved=false 임시 — Phase 2에서 resolveCrossSkill이 확정
      edges.push({
        fromId: proto.id,
        toId: `${proto.delegateTo}#scheduling`,
        relation: "DELEGATES_TO",
        fromSkill: slug,
        toSkill: null, // Phase 2에서 채움
        resolved: false,
        properties: JSON.stringify({ whenCondition: proto.whenCondition }),
      });

      if (proto.scopeRef) {
        edges.push({
          fromId: proto.id,
          toId: proto.scopeRef,
          relation: "SCOPED_TO",
          fromSkill: slug,
          toSkill: slug,
          resolved: true,
        });
      }
    }

    return { nodes, edges };
  }

  /** 전체 docs를 2-phase로 투영 → {nodes, edges, danglingCount} */
  projectAll(docs: SSLDocument[]): { nodes: KGNode[]; edges: KGEdge[]; danglingCount: number } {
    const allNodes: KGNode[] = [];
    const allEdges: KGEdge[] = [];
    const slugIndex = new Set<string>();
    const nodeIndex = new Set<string>();

    for (const doc of docs) {
      slugIndex.add(extractSlug(doc));
      const { nodes, edges } = this.projectDocument(doc);
      for (const n of nodes) { allNodes.push(n); nodeIndex.add(n.nodeId); }
      for (const e of edges) allEdges.push(e);
    }

    const edges = this.resolveCrossSkill(allEdges, nodeIndex, slugIndex);
    let danglingCount = 0;
    for (const e of edges) if (!e.resolved) danglingCount++;
    return { nodes: allNodes, edges, danglingCount };
  }

  /**
   * Phase 2 — 모든 doc을 projectDocument 한 후 호출.
   * DELEGATES_TO의 toId가 실제 다른 skill의 노드인지 확인.
   */
  resolveCrossSkill(
    allEdges: KGEdge[],
    nodeIndex: Set<string>,
    slugIndex: Set<string>,
  ): KGEdge[] {
    return allEdges.map((edge) => {
      if (edge.relation !== "DELEGATES_TO") return edge;

      const toId = edge.toId; // e.g. "target-skill#scheduling"
      const targetSlug = toId.includes("#") ? toId.split("#")[0] : toId;

      if (nodeIndex.has(toId)) {
        // 노드가 실제로 등록되어 있음 → fully resolved
        return { ...edge, toSkill: targetSlug, resolved: true };
      }
      if (slugIndex.has(targetSlug)) {
        // slug는 알지만 노드는 아직 없음 → partial resolve (slug known)
        return { ...edge, toSkill: targetSlug, resolved: true };
      }
      // dangling
      return { ...edge, toSkill: null, resolved: false };
    });
  }
}
