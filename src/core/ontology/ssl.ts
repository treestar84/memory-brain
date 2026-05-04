// SSL = Scheduling-Structural-Logical (arXiv 2604.24026, 2026)
// Closed vocabulary + 3-layer typed graph for skill normalization.
// Used by SkillNormalizer to convert SKILL.md into KG-Brain entries.

export const SSL_VERSION = "0.1.0" as const;

export const SCENES = [
  "PREPARE",
  "ACQUIRE",
  "REASON",
  "ACT",
  "VERIFY",
  "RECOVER",
  "FINALIZE",
] as const;
export type Scene = (typeof SCENES)[number];

export const ACTIONS = [
  "READ",
  "WRITE",
  "CALL_TOOL",
  "INFER",
  "EMIT",
  "WAIT",
  "BRANCH",
] as const;
export type Action = (typeof ACTIONS)[number];

export const RESOURCE_SCOPES = [
  "MEMORY",
  "LOCAL_FS",
  "CREDENTIALS",
  "NETWORK",
] as const;
export type ResourceScope = (typeof RESOURCE_SCOPES)[number];

// L1 — Scheduling: skill 호출 표면 (왜/언제 호출되는가)
export type SchedulingNode = {
  id: string;            // <slug>#scheduling
  skillName: string;     // frontmatter.name
  intentSignature: string;
  triggerPatterns: string[];
  ioContract: {
    inputsRaw: string;
    outputsRaw: string;
  };
  preconditions: string[];
};

// L2 — Structural: phase graph (어떻게 흐르는가)
export type StructuralNode = {
  id: string;            // <slug>#scene:<Scene>
  scene: Scene;
  summary: string;
  containsLogicalIds: string[];
  transitionsTo: string[]; // structural ids
};

// L3 — Logical: atomic action + resource scope (무엇을 하는가)
export type LogicalNode = {
  id: string;            // <slug>#logical:<n>
  action: Action;
  description: string;
  resources: ResourceScope[];
  evidenceClaimIds: string[];   // links to ClaimStore (PR-V3.5)
};

export type SSLDocument = {
  sslVersion: typeof SSL_VERSION;
  sourceSkillPath: string;       // 원본 SKILL.md path (source-of-truth)
  sourceSha256: string;          // rebuild detection
  generatedAt: string;
  generatedBy: "heuristic" | "llm";
  scheduling: SchedulingNode;
  structural: StructuralNode[];
  logical: LogicalNode[];
  warnings: string[];            // schema 위반 후보 (LLM normalizer로 채워야 할 hole)
};

const SCENE_SET: ReadonlySet<string> = new Set(SCENES);
const ACTION_SET: ReadonlySet<string> = new Set(ACTIONS);
const RESOURCE_SET: ReadonlySet<string> = new Set(RESOURCE_SCOPES);

export function isScene(v: string): v is Scene { return SCENE_SET.has(v); }
export function isAction(v: string): v is Action { return ACTION_SET.has(v); }
export function isResourceScope(v: string): v is ResourceScope { return RESOURCE_SET.has(v); }

// Hard validation — paper §4 'hard checks' 대응
export function validateSSL(doc: SSLDocument): string[] {
  const errors: string[] = [];

  if (doc.sslVersion !== SSL_VERSION) {
    errors.push(`sslVersion mismatch: ${doc.sslVersion} ≠ ${SSL_VERSION}`);
  }

  const structuralIds = new Set(doc.structural.map((s) => s.id));
  const logicalIds = new Set(doc.logical.map((l) => l.id));

  for (const s of doc.structural) {
    if (!isScene(s.scene)) errors.push(`structural ${s.id}: invalid scene '${s.scene}'`);
    for (const lid of s.containsLogicalIds) {
      if (!logicalIds.has(lid)) errors.push(`structural ${s.id}: dangling logical ref '${lid}'`);
    }
    for (const tid of s.transitionsTo) {
      if (!structuralIds.has(tid)) errors.push(`structural ${s.id}: dangling transition '${tid}'`);
    }
  }
  for (const l of doc.logical) {
    if (!isAction(l.action)) errors.push(`logical ${l.id}: invalid action '${l.action}'`);
    for (const r of l.resources) {
      if (!isResourceScope(r)) errors.push(`logical ${l.id}: invalid resource '${r}'`);
    }
  }
  return errors;
}
