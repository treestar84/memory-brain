#!/usr/bin/env bun
import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { PersonaStore } from "../src/core/persona/PersonaStore";
import { resolveStorageRoot } from "../src/hooks/bootstrap";

/**
 * cfgm-persona-list — peer + representation 조회 (PR-V3.8).
 *
 * 사용법:
 *   bun run bin/cfgm-persona-list.ts            # 전체 peer + representation
 *   bun run bin/cfgm-persona-list.ts --json
 */

const args = process.argv.slice(2);
const json = args.includes("--json");

const storage = new FsStorage(resolveStorageRoot());
const store = new PersonaStore(storage, new RealClock());

const peers = await store.listPeers();

if (json) {
  const out = await Promise.all(
    peers.map(async (p) => ({
      peer: p,
      representation: await store.getRepresentation(p.peerId),
    })),
  );
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

if (peers.length === 0) {
  console.log("(peer 없음 — `cfgm-persona-set peer <id> --kind <user|agent|external>` 으로 등록)");
  process.exit(0);
}

console.log(`Persona Layer (${peers.length} peers)\n`);

for (const peer of peers) {
  console.log(`## ${peer.peerId} (${peer.kind})`);
  console.log(`  createdAt: ${peer.createdAt}`);
  if (peer.metadata && Object.keys(peer.metadata).length > 0) {
    console.log(`  metadata: ${JSON.stringify(peer.metadata)}`);
  }
  const rep = await store.getRepresentation(peer.peerId);
  if (rep) {
    console.log(`  representation (${rep.decidedBy} @ ${rep.updatedAt}):`);
    console.log(`    "${rep.text}"`);
    if (rep.evidence.length > 0) {
      console.log(`  evidence:`);
      for (const e of rep.evidence) console.log(`    - ${e.source}`);
    }
  } else {
    console.log(`  representation: (없음)`);
  }
  console.log("");
}
