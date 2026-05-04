import {
  ACTIONS,
  CONTROL_FLOW_FEATURES,
  RESOURCE_SCOPES,
  SCENES,
  SSL_VERSION,
  validateSSL,
  type SSLDocument,
} from "../ontology/ssl";
import { SkillNormalizer, type NormalizeInput } from "./SkillNormalizer";

// PR-V3.13 — LLM-based SSL normalizer (paper §3.3 source-grounded NL2JSON).
//
// 흐름:
//   1) heuristic SkillNormalizer 가 1차 SSLDocument 생성 (warnings[] 에 hole 명시)
//   2) LLM 이 SKILL.md 원문 + heuristic SSL 을 입력받아 hole 메운 enriched SSL 출력
//   3) validateSSL gate 통과한 결과만 반환, 실패 시 heuristic 결과로 graceful fallback
//
// 모델: claude-opus-4-7 (가이드 강제 권장)
// 캐싱: SYSTEM_PROMPT 는 stable → cache_control ephemeral 로 ~90% input cost 절감

export const SYSTEM_PROMPT = [
  "You are a Skill Normalizer that converts SKILL.md natural-language documents into",
  "SSL (Scheduling-Structural-Logical) typed JSON documents per arXiv 2604.24026.",
  "",
  "## SSL closed vocabulary (use ONLY these enum values):",
  `- Scenes: ${SCENES.join(", ")}`,
  `- Actions: ${ACTIONS.join(", ")}`,
  `- ResourceScopes: ${RESOURCE_SCOPES.join(", ")}`,
  `- ControlFlowFeatures: ${CONTROL_FLOW_FEATURES.join(", ")}`,
  "",
  "## Your task:",
  "The user provides (a) the original SKILL.md source, and (b) a heuristic-generated",
  "SSL document with `warnings[]` indicating holes (empty intentSignatures, missing",
  "effects, etc.). Produce a single enriched SSL JSON document that fills those holes",
  "while preserving heuristic decisions that were correct.",
  "",
  "## Rules:",
  "1. Preserve `sourceSkillPath`, `sourceSha256`, `generatedAt` from heuristic input.",
  '2. Set `generatedBy: "llm"` and `sslVersion` to the value provided.',
  "3. Every Logical node MUST have an `effects[]` array — list observable post-conditions",
  "   in past-tense active form (e.g. 'urls_persisted', 'tests_executed').",
  "4. Fill `expectedInputs[]` and `expectedOutputs[]` as typed identifier names.",
  "5. Fill `dependencies[]` with concrete service/SDK/library names referenced.",
  "6. Fill `controlFlowFeatures[]` from the closed enum only.",
  "7. Fill `intentSignatures[]` with 1-5 alternate phrasings of when this skill applies.",
  "8. Each Structural node needs `sceneGoal` in active form (e.g. 'Fetch candidate URLs').",
  "9. Each Logical node should have `resourceTarget` — the specific identifier touched.",
  "10. NEVER invent enum values not in the closed vocabulary above.",
  "11. Output ONLY valid JSON matching the SSLDocument schema. No prose, no markdown.",
].join("\n");

// Minimal interface — production uses Anthropic SDK; tests inject a mock.
export interface LLMClient {
  complete(args: {
    systemPrompt: string;
    userPrompt: string;
    cacheSystem: boolean;
  }): Promise<string>;
}

export type LLMNormalizeOptions = {
  llmClient: LLMClient;
  /** If LLM call or validation fails, return heuristic doc + warning instead of throwing */
  gracefulFallback?: boolean;
};

export class LLMSkillNormalizer {
  private readonly heuristic = new SkillNormalizer();

  constructor(private readonly opts: LLMNormalizeOptions) {}

  async normalize(input: NormalizeInput): Promise<SSLDocument> {
    const heuristicDoc = this.heuristic.normalize(input);
    if (heuristicDoc.warnings.length === 0) {
      // Nothing for the LLM to fill — return heuristic as-is.
      return heuristicDoc;
    }

    const userPrompt = this.buildUserPrompt(input.source, heuristicDoc);

    let raw: string;
    try {
      raw = await this.opts.llmClient.complete({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
        cacheSystem: true,
      });
    } catch (e) {
      return this.fallback(heuristicDoc, `llm call failed: ${(e as Error).message}`);
    }

    let parsed: SSLDocument;
    try {
      parsed = JSON.parse(raw) as SSLDocument;
    } catch (e) {
      return this.fallback(heuristicDoc, `llm output not JSON: ${(e as Error).message}`);
    }

    // Force preservation of source-of-truth fields and version.
    parsed.sourceSkillPath = heuristicDoc.sourceSkillPath;
    parsed.sourceSha256 = heuristicDoc.sourceSha256;
    parsed.generatedAt = heuristicDoc.generatedAt;
    parsed.generatedBy = "llm";
    parsed.sslVersion = SSL_VERSION;

    const validationErrors = this.validateSafe(parsed);
    if (validationErrors.length > 0) {
      return this.fallback(heuristicDoc, `llm output schema invalid: ${validationErrors.join("; ")}`);
    }

    // Overwrite warnings — heuristic warnings are stale once LLM filled holes.
    parsed.warnings = [];
    return parsed;
  }

  private buildUserPrompt(source: string, heuristic: SSLDocument): string {
    return [
      "## Original SKILL.md",
      "```markdown",
      source,
      "```",
      "",
      "## Heuristic SSL document (fill the warnings)",
      "```json",
      JSON.stringify(heuristic, null, 2),
      "```",
      "",
      "Produce the enriched SSLDocument JSON now.",
    ].join("\n");
  }

  private validateSafe(doc: SSLDocument): string[] {
    try {
      return validateSSL(doc);
    } catch (e) {
      return [`schema crash: ${(e as Error).message}`];
    }
  }

  private fallback(heuristicDoc: SSLDocument, reason: string): SSLDocument {
    if (this.opts.gracefulFallback === false) {
      throw new Error(reason);
    }
    return {
      ...heuristicDoc,
      warnings: [...heuristicDoc.warnings, `llm-fallback: ${reason}`],
    };
  }
}

// Production Anthropic-backed client. Build once, reuse — system prompt is cached.
export function createAnthropicClient(args: {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
}): LLMClient {
  // Lazy import to keep the SDK out of the heuristic-only path & test runs.
  return {
    async complete({ systemPrompt, userPrompt, cacheSystem }) {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: args.apiKey });
      const model = args.model ?? "claude-opus-4-7";
      const maxTokens = args.maxTokens ?? 16000;

      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        thinking: { type: "adaptive" },
        system: cacheSystem
          ? [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }]
          : systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      // Extract text block(s); skip thinking blocks.
      const textBlocks = response.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text);
      return textBlocks.join("");
    },
  };
}
