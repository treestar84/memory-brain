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
  await deps.ledger.append(event);
  await deps.writer.write(event.sessionId);
  return null;
}
