import type { CanonicalEvent, StagePayload, Stage } from "../../core/events/CanonicalEvent";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const VERSION_PATH = join(import.meta.dir, "VERSION");
let adapterVersion: string;
try { adapterVersion = "claude-code@" + readFileSync(VERSION_PATH, "utf-8").trim(); }
catch { adapterVersion = "claude-code@unknown"; }

type Raw = Record<string, unknown>;
const STAGE_MAP: Record<string, Stage> = {
  SessionStart: "session-start", UserPromptSubmit: "prompt-submit",
  PreToolUse: "tool-pre", PostToolUse: "tool-post",
  PreCompact: "compact-pre", SessionEnd: "session-end", Stop: "stop",
};

function payload(type: string, r: Raw): StagePayload {
  const corrId = () => "corr-" + randomUUID().slice(0, 12);
  switch (type) {
    case "SessionStart": return { stage: "session-start" };
    case "UserPromptSubmit": return { stage: "prompt-submit", message: String(r.message ?? "") };
    case "PreToolUse": return { stage: "tool-pre", toolName: String(r.tool_name ?? ""), toolInput: r.tool_input, correlationId: corrId() };
    case "PostToolUse": return { stage: "tool-post", toolName: String(r.tool_name ?? ""), toolInput: r.tool_input, toolOutput: r.tool_output, correlationId: corrId() };
    case "PreCompact": return { stage: "compact-pre", turnCount: Number(r.turn_count ?? 0) };
    case "SessionEnd": return { stage: "session-end" };
    case "Stop": return { stage: "stop" };
    default: throw new Error(`Unknown hook type: ${type}`);
  }
}

export function mapClaudeCodeEvent(rawInput: unknown, timestampIso: string): CanonicalEvent {
  const r = rawInput as Raw;
  const type = String(r.type ?? "");
  const stage = STAGE_MAP[type];
  if (!stage) throw new Error(`Unknown hook type: ${type}`);
  return { platform: "claude-code", stage, sessionId: String(r.session_id ?? ""), cwd: String(r.cwd ?? ""), timestampIso, payload: payload(type, r), raw: rawInput, adapterVersion };
}
