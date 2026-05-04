// SSL = Scheduling-Structural-Logical (arXiv 2604.24026, 2026)
// Closed vocabulary + 3-layer typed graph for skill normalization.
// Used by SkillNormalizer to convert SKILL.md into KG-Brain entries.
//
// v0.2.0 (PR-V3.12.1) — schema 풍부화:
//   - Scheduling: skillGoal, intentSignatures[], expectedInputs/Outputs[],
//                 dependencies[], controlFlowFeatures[]
//   - Structural: sceneGoal (능동 목표 표현)
//   - Logical:    resourceTarget, effects[] (post-conditions)
//   - vocab 확장: ACTIONS += SCHEDULE, TRANSFORM / RESOURCE_SCOPES += DATABASE, QUEUE

export const SSL_VERSION = "0.2.0" as const;

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
  "SCHEDULE",
  "TRANSFORM",
] as const;
export type Action = (typeof ACTIONS)[number];

export const RESOURCE_SCOPES = [
  "MEMORY",
  "LOCAL_FS",
  "CREDENTIALS",
  "NETWORK",
  "DATABASE",
  "QUEUE",
] as const;
export type ResourceScope = (typeof RESOURCE_SCOPES)[number];

export const CONTROL_FLOW_FEATURES = [
  "branching",
  "loop",
  "scheduled_retry",
  "network_access",
  "credential_access",
  "long_running",
  "stateful",
] as const;
export type ControlFlowFeature = (typeof CONTROL_FLOW_FEATURES)[number];

// L1 — Scheduling: skill 호출 표면 (왜/언제 호출되는가)
export type SchedulingNode = {
  id: string;                      // <slug>#scheduling
  skillName: string;               // frontmatter.name
  /** High-level outcome statement (one sentence active form) */
  skillGoal: string;
  /** Primary intent (one-liner, derived from intentSignatures[0] for back-compat) */
  intentSignature: string;
  /** Multiple intent aliases / phrasings — paper Fig.1 'intent_signature' array form */
  intentSignatures: string[];
  triggerPatterns: string[];
  /** Structured input contract — typed arg names where extractable */
  expectedInputs: string[];
  /** Structured output contract */
  expectedOutputs: string[];
  /** External services / SDKs / tools referenced (e.g. 'supabase', 'qstash') */
  dependencies: string[];
  /** Closed-vocab flow hints — branching / scheduled_retry / network_access ... */
  controlFlowFeatures: ControlFlowFeature[];
  /** Free-form ioContract preserved for raw text snippets */
  ioContract: {
    inputsRaw: string;
    outputsRaw: string;
  };
  preconditions: string[];
};

// L2 — Structural: phase graph (어떻게 흐르는가)
export type StructuralNode = {
  id: string;                      // <slug>#scene:<Scene>
  scene: Scene;
  /** Active-form goal of this scene (paper 'scene_goal'). Defaults to summary. */
  sceneGoal: string;
  /** Heading/section text the scene was inferred from */
  summary: string;
  containsLogicalIds: string[];
  transitionsTo: string[];         // structural ids
};

// L3 — Logical: atomic action + resource scope (무엇을 하는가)
export type LogicalNode = {
  id: string;                      // <slug>#logical:<n>
  action: Action;
  description: string;
  resources: ResourceScope[];
  /** Specific target identifier (e.g. 'search_api', 'keyword_results' table) */
  resourceTarget?: string;
  /** Post-conditions / observable side-effects (paper 'effects[]') */
  effects: string[];
  evidenceClaimIds: string[];      // links to ClaimStore (PR-V3.5)
};

export type SSLDocument = {
  sslVersion: typeof SSL_VERSION;
  sourceSkillPath: string;         // 원본 SKILL.md path (source-of-truth)
  sourceSha256: string;            // rebuild detection
  generatedAt: string;
  generatedBy: "heuristic" | "llm";
  scheduling: SchedulingNode;
  structural: StructuralNode[];
  logical: LogicalNode[];
  warnings: string[];              // schema 위반 후보 (LLM normalizer로 채워야 할 hole)
};

const SCENE_SET: ReadonlySet<string> = new Set(SCENES);
const ACTION_SET: ReadonlySet<string> = new Set(ACTIONS);
const RESOURCE_SET: ReadonlySet<string> = new Set(RESOURCE_SCOPES);
const CFF_SET: ReadonlySet<string> = new Set(CONTROL_FLOW_FEATURES);

export function isScene(v: string): v is Scene { return SCENE_SET.has(v); }
export function isAction(v: string): v is Action { return ACTION_SET.has(v); }
export function isResourceScope(v: string): v is ResourceScope { return RESOURCE_SET.has(v); }
export function isControlFlowFeature(v: string): v is ControlFlowFeature { return CFF_SET.has(v); }

// Hard validation — paper §4 'hard checks' 대응
export function validateSSL(doc: SSLDocument): string[] {
  const errors: string[] = [];

  if (doc.sslVersion !== SSL_VERSION) {
    errors.push(`sslVersion mismatch: ${doc.sslVersion} ≠ ${SSL_VERSION}`);
  }

  for (const cff of doc.scheduling?.controlFlowFeatures ?? []) {
    if (!isControlFlowFeature(cff)) errors.push(`scheduling: invalid controlFlowFeature '${cff}'`);
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
