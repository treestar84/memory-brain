import { mapClaudeCodeEvent } from "./mapper";
import type { CanonicalEvent } from "../../core/events/CanonicalEvent";

export async function readStdinJson(): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of Bun.stdin.stream()) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf-8").trim();
  if (!text) return null;
  return JSON.parse(text);
}

export async function runHook(handler: (event: CanonicalEvent) => Promise<string | null>): Promise<void> {
  try {
    const raw = await readStdinJson();
    if (!raw) return;
    const event = mapClaudeCodeEvent(raw, new Date().toISOString());
    const output = await handler(event);
    if (output) process.stdout.write(output);
  } catch (e) {
    try {
      const { appendFileSync, mkdirSync } = await import("node:fs");
      const home = process.env.CFGM_HOME || `${process.env.HOME}/.memory-brain`;
      mkdirSync(`${home}/security`, { recursive: true });
      appendFileSync(`${home}/security/hook-errors.jsonl`, JSON.stringify({ error: String(e), ts: new Date().toISOString() }) + "\n");
    } catch {}
  }
}
