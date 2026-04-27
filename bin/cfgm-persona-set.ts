#!/usr/bin/env bun
import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { PersonaStore } from "../src/core/persona/PersonaStore";
import { resolveStorageRoot } from "../src/hooks/bootstrap";
import { PEER_KINDS, type PeerKind } from "../src/core/persona/types";

/**
 * cfgm-persona-set — peer 등록 또는 representation upsert (PR-V3.8).
 *
 * 사용법:
 *   bun run bin/cfgm-persona-set.ts peer <peerId> --kind user
 *   bun run bin/cfgm-persona-set.ts representation <peerId> --text "..." [--evidence "src1,src2"] [--by claude]
 */

const args = process.argv.slice(2);
const sub = args[0];

if (!sub || (sub !== "peer" && sub !== "representation")) {
  console.error("usage:");
  console.error("  cfgm-persona-set peer <peerId> --kind user|agent|external");
  console.error("  cfgm-persona-set representation <peerId> --text \"...\" [--evidence \"src1,src2\"] [--by claude]");
  process.exit(1);
}

const peerId = args[1];
if (!peerId || peerId.startsWith("--")) {
  console.error("peerId 필수");
  process.exit(1);
}

const storage = new FsStorage(resolveStorageRoot());
const store = new PersonaStore(storage, new RealClock());

if (sub === "peer") {
  const kindIdx = args.indexOf("--kind");
  const kind = kindIdx >= 0 ? (args[kindIdx + 1] as PeerKind) : undefined;
  if (!kind || !PEER_KINDS.includes(kind)) {
    console.error(`--kind 필수 (${PEER_KINDS.join(" / ")})`);
    process.exit(1);
  }
  await store.recordPeer(peerId, kind);
  console.log(`✓ peer ${peerId} (${kind}) recorded`);
} else {
  const textIdx = args.indexOf("--text");
  const evidenceIdx = args.indexOf("--evidence");
  const byIdx = args.indexOf("--by");
  const text = textIdx >= 0 ? args[textIdx + 1] : undefined;
  if (!text) {
    console.error("--text 필수");
    process.exit(1);
  }
  const evidenceArg = evidenceIdx >= 0 ? args[evidenceIdx + 1] : undefined;
  const evidence = evidenceArg
    ? evidenceArg.split(",").map((s) => ({ source: s.trim(), quote: null }))
    : [];
  const decidedBy = byIdx >= 0 ? args[byIdx + 1] : "user";
  await store.setRepresentation(peerId, text, evidence, decidedBy ?? "user");
  console.log(`✓ representation upsert for ${peerId} (by ${decidedBy})`);
}
