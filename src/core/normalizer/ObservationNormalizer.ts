import type { CanonicalEvent } from "../events/CanonicalEvent";
import type { Redactor } from "../security/Redactor";

export type Observation = {
  type: string;
  sessionId: string;
  timestamp: string;
  data: Record<string, unknown>;
  needsAnalysis: boolean;
};

export class ObservationNormalizer {
  constructor(private readonly redactor: Redactor) {}

  async normalize(event: CanonicalEvent): Promise<Observation | null> {
    const base = {
      sessionId: event.sessionId,
      timestamp: event.timestampIso,
    };

    switch (event.payload.stage) {
      case "tool-post": {
        const p = event.payload;
        const data = await this.normalizeToolPost(p.toolName, p.toolInput, p.toolOutput);
        return { ...base, type: `tool:${p.toolName}`, data, needsAnalysis: data._ambiguous === true };
      }
      case "prompt-submit": {
        const { text: redacted } = await this.redactor.redact(event.payload.message);
        return { ...base, type: "user-intent", data: { userIntentRaw: redacted }, needsAnalysis: true };
      }
      case "session-start":
        return { ...base, type: "session-start", data: {}, needsAnalysis: false };
      case "session-end":
        return { ...base, type: "session-end", data: {}, needsAnalysis: false };
      default:
        return null;
    }
  }

  private async normalizeToolPost(
    toolName: string,
    toolInput: unknown,
    toolOutput: unknown
  ): Promise<Record<string, unknown>> {
    const input = toolInput as Record<string, unknown>;
    const output = toolOutput as Record<string, unknown> | string;

    switch (toolName) {
      case "Edit":
      case "Write":
        return {
          filesTouched: [input.file_path ?? input.filePath ?? "unknown"],
          action: toolName.toLowerCase(),
        };
      case "Bash": {
        const { text: redactedCmd } = await this.redactor.redact(String(input.command ?? ""));
        const outputStr = typeof output === "string" ? output : JSON.stringify(output);
        return {
          command: redactedCmd,
          exitCode: typeof output === "object" && output !== null ? (output as any).exitCode ?? 0 : 0,
          outputSnippet: outputStr.slice(0, 200),
        };
      }
      case "Read":
        return { filesRead: [input.file_path ?? input.filePath ?? "unknown"] };
      case "Glob":
      case "Grep":
        return { searchPattern: input.pattern ?? input.glob ?? "", filesMatched: [] };
      default:
        return { toolName, _ambiguous: true };
    }
  }
}
