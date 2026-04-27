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

  // PR-V3.5 — Graphiti supersede 모델

  test("supersede — 이전 claim status 'superseded' + validTo + supersededBy", async () => {
    await store.append(makeCandidate({ candidateId: "old", status: "accepted" }));
    const next = makeCandidate({ candidateId: "new", proposedText: "v2 진술" });

    await store.supersede("old", next);

    const oldClaim = await store.getById("old");
    expect(oldClaim!.status).toBe("superseded");
    expect(oldClaim!.validTo).toBeTruthy();
    expect(oldClaim!.supersededBy).toBe("new");

    const newClaim = await store.getById("new");
    expect(newClaim!.validFrom).toBeTruthy();
    expect(newClaim!.validTo).toBeNull();
    expect(newClaim!.invalidAt).toBeNull();
  });

  test("supersede — 미존재 prevId → 에러", async () => {
    await expect(
      store.supersede("nope", makeCandidate({ candidateId: "x" })),
    ).rejects.toThrow("not found");
  });

  test("supersede — 이미 superseded → 에러", async () => {
    await store.append(makeCandidate({ candidateId: "p", status: "superseded" }));
    await expect(
      store.supersede("p", makeCandidate({ candidateId: "n" })),
    ).rejects.toThrow("already superseded");
  });

  test("invalidate — invalidAt + reason 갱신, status 그대로", async () => {
    await store.append(makeCandidate({ candidateId: "claim-x", status: "accepted" }));
    await store.invalidate("claim-x", "후속 검증 결과 metric 잘못 측정");

    const c = await store.getById("claim-x");
    expect(c!.status).toBe("accepted"); // status 보존
    expect(c!.invalidAt).toBeTruthy();
    expect(c!.reason).toContain("metric 잘못 측정");
  });

  test("invalidate — 미존재 → 에러", async () => {
    await expect(store.invalidate("nope", "사유")).rejects.toThrow("not found");
  });

  test("invalidate — 이미 invalid → 에러", async () => {
    await store.append(
      makeCandidate({ candidateId: "iv", status: "accepted", invalidAt: "2026-04-27T00:00:00Z" }),
    );
    await expect(store.invalidate("iv", "second")).rejects.toThrow("already invalidated");
  });
});
