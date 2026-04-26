import { describe, test, expect, beforeEach } from "bun:test";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";
import { ClaimStore } from "../../../src/core/claim/ClaimStore";
import type { ClaimCandidate } from "../../../src/core/claim/types";

function makeCandidate(overrides: Partial<ClaimCandidate> = {}): ClaimCandidate {
  return {
    candidateId: "cc-1",
    bundleId: "bnd-1",
    blockId: "blk-1",
    proposedType: "outcome",
    proposedText: "테스트 통과 후 production deploy",
    detectedBy: "outcome-confidence-promote",
    confidence: 0.9,
    evidence: [{ source: "flow-delta:bnd-1:blk-1", quote: "테스트 통과 후 production deploy" }],
    status: "pending",
    createdAt: "2026-04-26T00:00:00Z",
    decidedAt: null,
    decidedBy: null,
    reason: null,
    ...overrides,
  };
}

describe("ClaimStore", () => {
  let storage: MemoryStorage;
  let store: ClaimStore;

  beforeEach(() => {
    storage = new MemoryStorage();
    store = new ClaimStore(storage, new FakeClock(new Date("2026-04-26T00:00:00Z")));
  });

  test("append + list({status:pending}) → 1건", async () => {
    await store.append(makeCandidate());
    const list = await store.list({ status: "pending" });
    expect(list).toHaveLength(1);
    expect(list[0]!.candidateId).toBe("cc-1");
  });

  test("같은 candidateId 두 번 append → last-wins (1건)", async () => {
    await store.append(makeCandidate({ candidateId: "cc-x", confidence: 0.7 }));
    await store.append(makeCandidate({ candidateId: "cc-x", confidence: 0.95 }));
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.confidence).toBe(0.95);
  });

  test("status 필터 — pending/accepted 분리", async () => {
    await store.append(makeCandidate({ candidateId: "p1", status: "pending" }));
    await store.append(makeCandidate({ candidateId: "a1", status: "accepted" }));
    expect(await store.list({ status: "pending" })).toHaveLength(1);
    expect(await store.list({ status: "accepted" })).toHaveLength(1);
    expect(await store.list()).toHaveLength(2);
  });

  test("getById 정확 매치", async () => {
    await store.append(makeCandidate({ candidateId: "find-me" }));
    const c = await store.getById("find-me");
    expect(c).not.toBeNull();
    expect(c!.candidateId).toBe("find-me");
    expect(await store.getById("nope")).toBeNull();
  });

  test("빈 ledger → 빈 배열", async () => {
    expect(await store.list()).toEqual([]);
  });
});
