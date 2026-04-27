import { describe, test, expect, beforeEach } from "bun:test";
import { buildPersonaRepresentationDigest } from "../../src/hooks/session-start";
import { PersonaStore } from "../../src/core/persona/PersonaStore";
import { MemoryStorage } from "../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../src/core/clock/Clock";

describe("buildPersonaRepresentationDigest (PR-V3.8)", () => {
  let store: PersonaStore;

  beforeEach(() => {
    const clock = new FakeClock(new Date("2026-04-28T10:00:00Z"));
    store = new PersonaStore(new MemoryStorage(), clock);
  });

  test("peer 0건 → 빈 배열", async () => {
    expect(await buildPersonaRepresentationDigest(store)).toEqual([]);
  });

  test("peer 있지만 representation 0 → 빈 배열", async () => {
    await store.recordPeer("user-1", "user");
    expect(await buildPersonaRepresentationDigest(store)).toEqual([]);
  });

  test("representation 1건 → header + 1줄", async () => {
    await store.recordPeer("user-1", "user");
    await store.setRepresentation("user-1", "선호: 짧고 명확한 설명");

    const lines = await buildPersonaRepresentationDigest(store);
    expect(lines[0]).toBe("### 🧬 persona representations");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("user-1");
    expect(lines[1]).toContain("(user)");
    expect(lines[1]).toContain("선호: 짧고 명확한 설명");
  });

  test("다중 peer + representation 누적 — 각 peer 1줄", async () => {
    await store.recordPeer("user-1", "user");
    await store.recordPeer("agent", "agent");
    await store.setRepresentation("user-1", "user 1 모델");
    await store.setRepresentation("agent", "agent 1 모델");

    const lines = await buildPersonaRepresentationDigest(store);
    expect(lines).toHaveLength(3); // header + 2
    expect(lines.some((l) => l.includes("user-1"))).toBe(true);
    expect(lines.some((l) => l.includes("agent"))).toBe(true);
  });

  test("representation 없는 peer 는 행 안 만듬", async () => {
    await store.recordPeer("with-rep", "user");
    await store.recordPeer("without-rep", "user");
    await store.setRepresentation("with-rep", "있다");

    const lines = await buildPersonaRepresentationDigest(store);
    expect(lines).toHaveLength(2); // header + 1
    expect(lines[1]).toContain("with-rep");
  });

  test("긴 representation 은 200B 로 클립", async () => {
    await store.recordPeer("user-x", "user");
    const long = "a".repeat(500);
    await store.setRepresentation("user-x", long);

    const lines = await buildPersonaRepresentationDigest(store);
    expect(lines[1]!.length).toBeLessThan(300); // header + label + clipped
  });
});
