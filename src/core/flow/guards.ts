import {
  FLOW_BLOCK_TYPES, RELATION_KINDS,
  type FlowBlock, type FlowDelta, type ObservationBundle, type Relation,
} from "./types";

export function isFlowBlockType(v: unknown): v is typeof FLOW_BLOCK_TYPES[number] {
  return typeof v === "string" && (FLOW_BLOCK_TYPES as readonly string[]).includes(v);
}

export function isRelationKind(v: unknown): v is typeof RELATION_KINDS[number] {
  return typeof v === "string" && (RELATION_KINDS as readonly string[]).includes(v);
}

export function isRelation(v: unknown): v is Relation {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return isRelationKind(r.kind) && typeof r.targetBlockId === "string"
    && typeof r.confidence === "number" && r.confidence >= 0 && r.confidence <= 1;
}

export function isFlowBlock(v: unknown): v is FlowBlock {
  if (!v || typeof v !== "object") return false;
  const b = v as Record<string, unknown>;
  return typeof b.blockId === "string"
    && typeof b.problemId === "string"
    && isFlowBlockType(b.type)
    && (b.status === "confirmed" || b.status === "superseded")
    && typeof b.label === "string"
    && typeof b.confidence === "number" && b.confidence >= 0 && b.confidence <= 1
    && Array.isArray(b.supportedBy) && b.supportedBy.every(s => typeof s === "string")
    && Array.isArray(b.relations) && b.relations.every(isRelation)
    && typeof b.createdAt === "string"
    && (b.lastConfirmedAt === null || typeof b.lastConfirmedAt === "string")
    && (b.staleAfter === null || typeof b.staleAfter === "string")
    && (b.supersededBy === null || typeof b.supersededBy === "string")
    && typeof b.bundleId === "string";
}

export function isFlowDelta(v: unknown): v is FlowDelta {
  if (!v || typeof v !== "object") return false;
  const d = v as Record<string, unknown>;
  if (typeof d.timestampIso !== "string") return false;
  switch (d.op) {
    case "block-add": return isFlowBlock(d.block);
    case "block-supersede":
      return typeof d.problemId === "string"
        && typeof d.blockId === "string"
        && typeof d.supersededBy === "string"
        && typeof d.reason === "string";
    case "relation-add":
      return typeof d.problemId === "string"
        && typeof d.fromBlockId === "string"
        && isRelation(d.relation);
    case "cue-card-regen":
      return typeof d.problemId === "string"
        && typeof d.bodyHash === "string"
        && typeof d.bodyBytes === "number";
    default: return false;
  }
}

export function isObservationBundle(v: unknown): v is ObservationBundle {
  if (!v || typeof v !== "object") return false;
  const b = v as Record<string, unknown>;
  return typeof b.bundleId === "string"
    && (b.activeProblemId === null || typeof b.activeProblemId === "string")
    && typeof b.sessionId === "string"
    && typeof b.turnOrdinal === "number"
    && typeof b.openedAt === "string"
    && typeof b.sealedAt === "string"
    && Array.isArray(b.eventIds)
    && Array.isArray(b.observations)
    && typeof b.metrics === "object" && b.metrics !== null
    && Array.isArray(b.recentBlockIds)
    && (b.processedAt === null || typeof b.processedAt === "string")
    && (b.processedByVersion === null || typeof b.processedByVersion === "string");
}
