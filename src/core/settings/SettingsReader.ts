import { resolve } from "node:path";
import { homedir } from "node:os";
import { FLOW_CONFIG } from "../flow/config";

export type QuestionPolicy = {
  cooldownMinutes: number;
  dailyCap: number;
};

export function defaultSettingsPath(): string {
  if (process.env.CLAUDE_CONFIG_DIR) {
    return resolve(process.env.CLAUDE_CONFIG_DIR, "settings.json");
  }
  const home = process.env.HOME || homedir();
  return resolve(home, ".claude-brain", "settings.json");
}

export class SettingsReader {
  constructor(private readonly settingsPath: string = defaultSettingsPath()) {}

  async getQuestionPolicy(): Promise<QuestionPolicy> {
    const defaults: QuestionPolicy = {
      cooldownMinutes: FLOW_CONFIG.QUESTION_POLICY.COOLDOWN_MINUTES,
      dailyCap: FLOW_CONFIG.QUESTION_POLICY.DAILY_CAP,
    };

    const raw = await this.readRaw();
    if (raw === null) return defaults;

    const override = (raw as Record<string, unknown>)?.memoryBrain;
    if (!override || typeof override !== "object") return defaults;

    const policy = (override as Record<string, unknown>).questionPolicy;
    if (!policy || typeof policy !== "object") return defaults;

    const p = policy as Record<string, unknown>;
    return {
      cooldownMinutes: typeof p.cooldownMinutes === "number" && p.cooldownMinutes >= 0
        ? p.cooldownMinutes
        : defaults.cooldownMinutes,
      dailyCap: typeof p.dailyCap === "number" && p.dailyCap >= 0
        ? p.dailyCap
        : defaults.dailyCap,
    };
  }

  private async readRaw(): Promise<unknown | null> {
    try {
      const file = Bun.file(this.settingsPath);
      if (!(await file.exists())) return null;
      const text = await file.text();
      if (!text.trim()) return null;
      return JSON.parse(text);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[SettingsReader] failed to parse ${this.settingsPath}: ${msg}`);
      return null;
    }
  }
}
