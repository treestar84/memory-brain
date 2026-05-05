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
//
// v0.3.0 (PR-V3.17a/b) — execution-capable graph:
//   - Logical: actionRef? (canonical store reference)
//   - SSLDocument 신규 4 노드 컬렉션 (모두 optional, empty 기본):
//     - decisions[]   — when/then 분기
//     - interactions[] — 사용자 발화 템플릿
//     - evidence[]     — input/output sample + success criteria
//     - protocols[]    — 다른 skill 위임 규약

export const SSL_VERSION = "0.3.0" as const;

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

// v0.3.0 — InteractionNode 가 사용자에게 기대하는 응답의 종류
export const EXPECTED_RESPONSE_TYPES = [
  "free-text",
  "yes-no",
  "selection",
  "structured",
  "none",
] as const;
export type ExpectedResponseType = (typeof EXPECTED_RESPONSE_TYPES)[number];

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
  /**
   * Optional reference to a canonical action pattern (PR-V3.17a).
   * 본 필드가 있으면 validateSSL 가 canonical store 의 정의와 action/resources
   * 일치를 강제한다. 같은 패턴은 항상 같은 ref ID 로 표현되어 결정성을 보장.
   * store 미주입 시에도 schema 통과 — back-compat.
   */
  actionRef?: string;
  /** Specific target identifier (e.g. 'search_api', 'keyword_results' table) */
  resourceTarget?: string;
  /** Post-conditions / observable side-effects (paper 'effects[]') */
  effects: string[];
  evidenceClaimIds: string[];      // links to ClaimStore (PR-V3.5)
};

// v0.3.0 신규 4 노드 — execution-capable graph
//
// scopeRef 패턴: structural id (`<slug>#scene:...`) 또는 logical id
// (`<slug>#logical:N`) 를 가리켜 노드가 어느 phase/action 에 속하는지 명시.
// dangling 시 validateSSL 가 거부.

export type DecisionNode = {
  id: string;                        // <slug>#decision:N
  question: string;                  // 자연어 — 무엇을 판단하는가
  branches: Array<{
    when: string;                    // 자연어 조건
    then: string;                    // 자연어 행동 또는 노드 ID
  }>;
  fallback?: string;                  // 어느 branch 도 안 맞을 때 (자연어)
  scopeRef?: string;                  // structural/logical id (optional)
};

export type InteractionNode = {
  id: string;                        // <slug>#interaction:N
  prompt: string;                    // 자연어 발화 템플릿 ({var} 형식 변수 허용)
  expectedResponseType: ExpectedResponseType;
  variables: string[];               // 템플릿 안의 {var} 식별자 목록
  options?: string[];                // expectedResponseType="selection" 일 때 선택지
  scopeRef?: string;
};

export type EvidenceNode = {
  id: string;                        // <slug>#evidence:N
  caseLabel: string;                 // 짧은 case 이름
  inputs: Record<string, unknown>;   // 자유 형식 (sample input)
  outputs: Record<string, unknown>;  // 자유 형식 (sample output)
  successCriteria: string[];         // 자연어 검증 조건 목록
  scopeRef?: string;
};

export type ProtocolNode = {
  id: string;                        // <slug>#protocol:N
  delegateTo: string;                // 다른 skill slug 또는 ref (예: 'bmad-help')
  whenCondition: string;             // 자연어 — 언제 위임하는가
  inputsForward: string[];           // 위임 시 넘겨주는 식별자
  outputsExpected: string[];         // 위임 응답으로 기대되는 식별자
  scopeRef?: string;
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
  // v0.3.0 신규 4 노드 — 모두 optional 배열, 빈 배열 default (back-compat)
  decisions?: DecisionNode[];
  interactions?: InteractionNode[];
  evidence?: EvidenceNode[];
  protocols?: ProtocolNode[];
  warnings: string[];              // schema 위반 후보 (LLM normalizer로 채워야 할 hole)
};

const SCENE_SET: ReadonlySet<string> = new Set(SCENES);
const ACTION_SET: ReadonlySet<string> = new Set(ACTIONS);
const RESOURCE_SET: ReadonlySet<string> = new Set(RESOURCE_SCOPES);
const CFF_SET: ReadonlySet<string> = new Set(CONTROL_FLOW_FEATURES);
const RESPONSE_TYPE_SET: ReadonlySet<string> = new Set(EXPECTED_RESPONSE_TYPES);

export function isScene(v: string): v is Scene { return SCENE_SET.has(v); }
export function isAction(v: string): v is Action { return ACTION_SET.has(v); }
export function isResourceScope(v: string): v is ResourceScope { return RESOURCE_SET.has(v); }
export function isControlFlowFeature(v: string): v is ControlFlowFeature { return CFF_SET.has(v); }
export function isExpectedResponseType(v: string): v is ExpectedResponseType { return RESPONSE_TYPE_SET.has(v); }

/** Optional canonical action lookup. Provided to validateSSL when available. */
export type CanonicalActionLookup = {
  resolve(ref: string): { action: Action; resources: ResourceScope[] } | null;
};

// Hard validation — paper §4 'hard checks' 대응
export function validateSSL(doc: SSLDocument, opts?: { canonicalActions?: CanonicalActionLookup }): string[] {
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
  // v0.3.0 — 4 신규 노드 ID 집합 (scopeRef dangling 검증용)
  const knownScopes = new Set<string>([...structuralIds, ...logicalIds]);
  const checkScopeRef = (nodeKind: string, nodeId: string, ref: string | undefined) => {
    if (ref === undefined) return;
    if (!knownScopes.has(ref)) {
      errors.push(`${nodeKind} ${nodeId}: dangling scopeRef '${ref}'`);
    }
  };

  for (const d of doc.decisions ?? []) {
    if (typeof d.id !== "string" || d.id.length === 0) errors.push(`decision: missing id`);
    if (typeof d.question !== "string") errors.push(`decision ${d.id}: question must be string`);
    if (!Array.isArray(d.branches) || d.branches.length === 0) {
      errors.push(`decision ${d.id}: branches must be non-empty array`);
    }
    checkScopeRef("decision", d.id, d.scopeRef);
  }
  for (const i of doc.interactions ?? []) {
    if (typeof i.id !== "string" || i.id.length === 0) errors.push(`interaction: missing id`);
    if (typeof i.prompt !== "string") errors.push(`interaction ${i.id}: prompt must be string`);
    if (!isExpectedResponseType(i.expectedResponseType)) {
      errors.push(`interaction ${i.id}: invalid expectedResponseType '${i.expectedResponseType}'`);
    }
    if (i.expectedResponseType === "selection" && (!i.options || i.options.length === 0)) {
      errors.push(`interaction ${i.id}: expectedResponseType=selection requires options[]`);
    }
    checkScopeRef("interaction", i.id, i.scopeRef);
  }
  for (const e of doc.evidence ?? []) {
    if (typeof e.id !== "string" || e.id.length === 0) errors.push(`evidence: missing id`);
    if (typeof e.caseLabel !== "string") errors.push(`evidence ${e.id}: caseLabel must be string`);
    if (!Array.isArray(e.successCriteria)) errors.push(`evidence ${e.id}: successCriteria must be array`);
    checkScopeRef("evidence", e.id, e.scopeRef);
  }
  for (const p of doc.protocols ?? []) {
    if (typeof p.id !== "string" || p.id.length === 0) errors.push(`protocol: missing id`);
    if (typeof p.delegateTo !== "string" || p.delegateTo.length === 0) {
      errors.push(`protocol ${p.id}: delegateTo must be non-empty string`);
    }
    checkScopeRef("protocol", p.id, p.scopeRef);
  }

  for (const l of doc.logical) {
    if (!isAction(l.action)) errors.push(`logical ${l.id}: invalid action '${l.action}'`);
    for (const r of l.resources) {
      if (!isResourceScope(r)) errors.push(`logical ${l.id}: invalid resource '${r}'`);
    }
    // PR-V3.17a — actionRef 검증.
    if (l.actionRef !== undefined) {
      if (!opts?.canonicalActions) {
        // store 없으면 검증 skip — back-compat (graceful)
        continue;
      }
      const def = opts.canonicalActions.resolve(l.actionRef);
      if (!def) {
        errors.push(`logical ${l.id}: actionRef '${l.actionRef}' not found in canonical store`);
        continue;
      }
      if (def.action !== l.action) {
        errors.push(`logical ${l.id}: actionRef '${l.actionRef}' resolves to action '${def.action}' but logical declares '${l.action}'`);
      }
      const aSet = new Set(l.resources);
      const bSet = new Set(def.resources);
      const missing = [...bSet].filter((r) => !aSet.has(r));
      const extra = [...aSet].filter((r) => !bSet.has(r));
      if (missing.length > 0 || extra.length > 0) {
        errors.push(`logical ${l.id}: actionRef '${l.actionRef}' resources mismatch (missing: [${missing.join(",")}], extra: [${extra.join(",")}])`);
      }
    }
  }
  return errors;
}
