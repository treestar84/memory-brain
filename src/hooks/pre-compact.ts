import type { CanonicalEvent } from "../core/events/CanonicalEvent";
import type { RawLedger } from "../core/ledger/RawLedger";
import type { ResumeSheetWriter } from "../core/compaction/ResumeSheetWriter";

export type PreCompactDeps = {
  ledger: RawLedger;
  writer: ResumeSheetWriter;
};

export async function handlePreCompact(
  event: CanonicalEvent,
  deps: PreCompactDeps,
): Promise<string | null> {
  try {
    await deps.ledger.append(event);
  } catch (e) {
    console.error("[pre-compact] ledger append failed:", e);
  }
  try {
    await deps.writer.write(event.sessionId);
  } catch (e) {
    console.error("[pre-compact] writer failed:", e);
  }
  return null;
}

if (import.meta.main) {
  const { runHook } = await import("../adapters/claude-code/hook-runner");
  const { buildDeps } = await import("./bootstrap");
  const deps = buildDeps();
  await runHook(async (event) => handlePreCompact(event, { ledger: deps.ledger, writer: deps.resumeWriter }));
}
