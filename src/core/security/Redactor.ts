import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import { DEFAULT_PATTERNS, type SensitivePattern } from "./patterns";

export type RedactionRecord = {
  timestamp: string;
  patternName: string;
  context: string;
};

export class Redactor {
  private patterns: SensitivePattern[];

  constructor(
    private readonly storage: Storage,
    private readonly clock: Clock,
    customPatterns?: SensitivePattern[]
  ) {
    this.patterns = customPatterns ?? DEFAULT_PATTERNS;
  }

  async redact(input: string): Promise<{ text: string; redacted: boolean }> {
    let text = input;
    let redacted = false;

    for (const pattern of this.patterns) {
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      if (regex.test(text)) {
        redacted = true;
        text = text.replace(new RegExp(pattern.regex.source, pattern.regex.flags), `<REDACTED:${pattern.name}>`);
        await this.storage.appendJsonl("security/redacted.jsonl", {
          timestamp: this.clock.isoNow(),
          patternName: pattern.name,
          context: input.slice(0, 100),
        } satisfies RedactionRecord);
      }
    }

    return { text, redacted };
  }
}
