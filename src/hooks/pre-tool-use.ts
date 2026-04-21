import type { CanonicalEvent } from "../core/events/CanonicalEvent";
import type { Storage } from "../core/storage/Storage";
import type { Clock } from "../core/clock/Clock";
import type { RawLedger } from "../core/ledger/RawLedger";

export type PreToolDeps = {
  storage: Storage;
  clock: Clock;
  ledger: RawLedger;
};

const DANGEROUS_PATTERNS = [
  /rm\s+(-[a-z]*f[a-z]*\s+|--force\s+)*\//i,
  /\bsudo\b/,
  /\brm\s+-rf\b/,
];

export async function handlePreToolUse(
  event: CanonicalEvent,
  deps: PreToolDeps
): Promise<string | null> {
  await deps.ledger.append(event);

  if (event.payload.stage !== "tool-pre") return null;
  if (event.payload.toolName !== "Bash") return null;

  const command = String((event.payload.toolInput as Record<string, unknown>)?.command ?? "");

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return `### ⚠️ memory-brain\n위험 명령 감지: \`${command.slice(0, 80)}\``;
    }
  }

  return null;
}

if (import.meta.main) {
  const { runHook } = await import("../adapters/claude-code/hook-runner");
  const { buildDeps } = await import("./bootstrap");
  const deps = buildDeps();
  await runHook(async (event) => handlePreToolUse(event, deps));
}
