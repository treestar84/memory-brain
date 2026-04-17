export type Stage =
  | "session-start" | "prompt-submit" | "tool-pre" | "tool-post"
  | "compact-pre" | "session-end" | "stop";

export type SessionStartPayload = { stage: "session-start" };
export type PromptSubmitPayload = { stage: "prompt-submit"; message: string };
export type ToolPrePayload = { stage: "tool-pre"; toolName: string; toolInput: unknown; correlationId: string };
export type ToolPostPayload = { stage: "tool-post"; toolName: string; toolInput: unknown; toolOutput: unknown; correlationId: string };
export type CompactPrePayload = { stage: "compact-pre"; turnCount: number };
export type SessionEndPayload = { stage: "session-end" };
export type StopPayload = { stage: "stop" };

export type StagePayload =
  | SessionStartPayload | PromptSubmitPayload | ToolPrePayload | ToolPostPayload
  | CompactPrePayload | SessionEndPayload | StopPayload;

export type CanonicalEvent = {
  platform: string;
  stage: Stage;
  sessionId: string;
  cwd: string;
  timestampIso: string;
  payload: StagePayload;
  raw: unknown;
  adapterVersion: string;
};
