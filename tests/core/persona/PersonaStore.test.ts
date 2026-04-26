import { describe, test, expect, beforeEach } from "bun:test";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";
import { PersonaStore } from "../../../src/core/persona/PersonaStore";

describe("PersonaStore", () => {
  let storage: MemoryStorage;
  let clock: FakeClock;
  let store: PersonaStore;

  beforeEach(() => {
    storage = new MemoryStorage();
    clock = new FakeClock(new Date("2026-04-27T10:00:00Z"));
    store = new PersonaStore(storage, clock);
  });

  test("recordPeer + listPeers — 단건", async () => {
    await store.recordPeer("user-1", "user", { name: "alice" });
    const peers = await store.listPeers();
    expect(peers).toHaveLength(1);
    expect(peers[0]!.peerId).toBe("user-1");
    expect(peers[0]!.kind).toBe("user");
    expect(peers[0]!.metadata?.name).toBe("alice");
  });

  test("recordPeer 두 번 → last-wins, createdAt 보존", async () => {
    await store.recordPeer("user-1", "user", { v: 1 });
    clock.advance(60_000);
    await store.recordPeer("user-1", "user", { v: 2 });
    const peers = await store.listPeers();
    expect(peers).toHaveLength(1);
    expect(peers[0]!.metadata?.v).toBe(2);
    expect(peers[0]!.createdAt).toBe("2026-04-27T10:00:00.000Z");
    expect(peers[0]!.updatedAt).toBe("2026-04-27T10:01:00.000Z");
  });

  test("recordSession + getSession", async () => {
    await store.recordSession("sess-1", ["user-1", "agent-1"]);
    const s = await store.getSession("sess-1");
    expect(s).not.toBeNull();
    expect(s!.peerIds).toEqual(["user-1", "agent-1"]);
  });

  test("recordMessage + listMessages — sessionId 필터", async () => {
    await store.recordMessage("sess-A", "user-1", "hello");
    await store.recordMessage("sess-A", "agent-1", "hi");
    await store.recordMessage("sess-B", "user-1", "elsewhere");

    const allA = await store.listMessages("sess-A");
    expect(allA).toHaveLength(2);

    const allB = await store.listMessages("sess-B");
    expect(allB).toHaveLength(1);

    const all = await store.listMessages();
    expect(all).toHaveLength(3);
  });

  test("setRepresentation + getRepresentation — 수동 upsert", async () => {
    await store.setRepresentation("user-1", "선호: 짧고 명확한 설명", [
      { source: "session:sess-1:msg-1", quote: "이해하기 쉽게 설명" },
    ]);

    const rep = await store.getRepresentation("user-1");
    expect(rep).not.toBeNull();
    expect(rep!.text).toBe("선호: 짧고 명확한 설명");
    expect(rep!.evidence).toHaveLength(1);
    expect(rep!.evidence[0]!.source).toBe("session:sess-1:msg-1");
  });

  test("setRepresentation 두 번 → last-wins, decidedBy 갱신", async () => {
    await store.setRepresentation("user-1", "v1", [], "user");
    clock.advance(60_000);
    await store.setRepresentation("user-1", "v2 — 보강된 representation", [], "claude");

    const rep = await store.getRepresentation("user-1");
    expect(rep!.text).toBe("v2 — 보강된 representation");
    expect(rep!.decidedBy).toBe("claude");
    expect(rep!.createdAt).toBe("2026-04-27T10:00:00.000Z");
  });

  test("getRepresentation 미존재 peer → null", async () => {
    expect(await store.getRepresentation("nope")).toBeNull();
  });

  test("listMessages 빈 ledger → 빈 배열", async () => {
    expect(await store.listMessages()).toEqual([]);
  });
});
