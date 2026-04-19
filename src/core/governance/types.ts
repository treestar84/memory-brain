import type { FlowBlockType } from "../flow/types";

export type RuleSeverity = "error" | "warning";

// shacl-lite.yaml에서 로드되는 rule 타입들

/** blockType의 블록이 최소 minCount개 이상 존재해야 함 */
export type RequiredBlockTypeRule = {
  id: string;
  type: "required-block-type";
  blockType: FlowBlockType;
  minCount: number;
  severity: RuleSeverity;
  message: string;
};

/** blockType의 블록이 field로 참조하는 blockId가 그래프 내에 실제로 존재해야 함 */
export type OrphanCheckRule = {
  id: string;
  type: "orphan-check";
  blockType: FlowBlockType;
  field: "gapBlockId";
  severity: RuleSeverity;
  message: string;
};

/** supersededBy 값이 null, sentinel(decay-reason), 또는 유효한 blockId여야 함 */
export type SupersedeChainRule = {
  id: string;
  type: "supersede-chain";
  severity: RuleSeverity;
  message: string;
};

/** blockType의 블록이 supportedBy 배열을 최소 1개 이상 가져야 함 */
export type ProvenanceCheckRule = {
  id: string;
  type: "provenance-check";
  blockType: FlowBlockType;
  severity: RuleSeverity;
  message: string;
};

export type ShaclRule =
  | RequiredBlockTypeRule
  | OrphanCheckRule
  | SupersedeChainRule
  | ProvenanceCheckRule;

export type ShaclLiteSchema = {
  version: string;
  rules: ShaclRule[];
};

// Validation 결과 타입

export type ValidationViolation = {
  ruleId: string;
  severity: RuleSeverity;
  blockId?: string;
  message: string;
};

export type ValidationReport = {
  version: string;
  generatedAt: string;
  problemId: string;
  violations: ValidationViolation[];
  /** error severity violation이 0개인 경우 true */
  isValid: boolean;
};
