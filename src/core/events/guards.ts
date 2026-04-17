import type { CanonicalEvent, Stage, ToolPrePayload, ToolPostPayload, PromptSubmitPayload, CompactPrePayload } from "./CanonicalEvent";

const VALID_STAGES: Stage[] = ["session-start", "prompt-submit", "tool-pre", "tool-post", "compact-pre", "session-end", "stop"];

export function isValidStage(s: unknown): s is Stage {
  return typeof s === "string" && VALID_STAGES.includes(s as Stage);
}

export function isCanonicalEvent(obj: unknown): obj is CanonicalEvent {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return typeof o.platform === "string" && isValidStage(o.stage) && typeof o.sessionId === "string"
    && typeof o.cwd === "string" && typeof o.timestampIso === "string"
    && typeof o.payload === "object" && o.payload !== null && typeof o.adapterVersion === "string";
}

export function isToolPre(e: CanonicalEvent): e is CanonicalEvent & { payload: ToolPrePayload } { return e.stage === "tool-pre"; }
export function isToolPost(e: CanonicalEvent): e is CanonicalEvent & { payload: ToolPostPayload } { return e.stage === "tool-post"; }
export function isPromptSubmit(e: CanonicalEvent): e is CanonicalEvent & { payload: PromptSubmitPayload } { return e.stage === "prompt-submit"; }
export function isCompactPre(e: CanonicalEvent): e is CanonicalEvent & { payload: CompactPrePayload } { return e.stage === "compact-pre"; }
