import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsStorage } from "../../../src/core/storage/FsStorage";
import { FakeClock } from "../../../src/core/clock/Clock";
import { PromotionLedger } from "../../../src/core/identity/PromotionLedger";
import type { PromotedCandidate } from "../../../src/core/identity/types";

function makeCandidate(overrides: Partial<PromotedCandidate> = {}): PromotedCandidate {
  return {
    candidateId: "cand-1",
    bundleId: "bnd-1",
    proposedTarget: "tools",
    proposedLabel: "tool 사용 패턴: bun (5회)",
    detectedBy: "high-tool-call-pattern",
    metrics: { toolCallCount: 5 },
    status: "pending",
    createdAt: "2026-04-26T00:00:00Z",
    decidedAt: null,
    decidedBy: null,
    reason: null,
    ...overrides,
  };
}

describe("PromotionLedger", () => {
  let root: string;
  let ledger: PromotionLedger;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "promo-ledger-"));
    ledger = new PromotionLedger(new FsStorage(root), new FakeClock());
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("빈 ledger list → []", async () => {
    expect(await ledger.list()).toEqual([]);
  });

  test("append 후 list → 1건", async () => {
    await ledger.append(makeCandidate({ candidateId: "c1" }));
    const list = await ledger.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.candidateId).toBe("c1");
  });

  test("같은 candidateId 두 번 append → list는 last-wins 1건", async () => {
    await ledger.append(makeCandidate({ candidateId: "c1", proposedLabel: "v1" }));
    await ledger.append(makeCandidate({ candidateId: "c1", proposedLabel: "v2" }));
    const list = await ledger.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.proposedLabel).toBe("v2");
  });

  test("decide('accepted') → status·decidedAt·decidedBy 갱신", async () => {
    await ledger.append(makeCandidate({ candidateId: "c1" }));
    const updated = await ledger.decide("c1", "accepted", { decidedBy: "user", reason: "good fit" });
    expect(updated.status).toBe("accepted");
    expect(updated.decidedAt).not.toBeNull();
    expect(updated.decidedBy).toBe("user");
    expect(updated.reason).toBe("good fit");
    const list = await ledger.list();
    expect(list[0]!.status).toBe("accepted");
  });

  test("decide 미존재 candidateId → throw", async () => {
    await expect(ledger.decide("nope", "accepted")).rejects.toThrow(/not found/);
  });

  test("이미 accepted를 force 없이 decide → throw", async () => {
    await ledger.append(makeCandidate({ candidateId: "c1" }));
    await ledger.decide("c1", "accepted");
    await expect(ledger.decide("c1", "rejected")).rejects.toThrow(/이미 결정됨/);
  });

  test("이미 accepted를 force=true + reason으로 reversal → 성공", async () => {
    await ledger.append(makeCandidate({ candidateId: "c1" }));
    await ledger.decide("c1", "accepted");
    const reversed = await ledger.decide("c1", "rejected", {
      force: true, reason: "오인 승인 회수",
    });
    expect(reversed.status).toBe("rejected");
    expect(reversed.reason).toBe("오인 승인 회수");
    const list = await ledger.list();
    expect(list[0]!.status).toBe("rejected");
  });

  test("status filter 동작", async () => {
    await ledger.append(makeCandidate({ candidateId: "c1" }));
    await ledger.append(makeCandidate({ candidateId: "c2" }));
    await ledger.decide("c1", "accepted");
    expect(await ledger.list({ status: "pending" })).toHaveLength(1);
    expect(await ledger.list({ status: "accepted" })).toHaveLength(1);
    expect(await ledger.list({ status: "rejected" })).toHaveLength(0);
  });

  test("getById null 케이스", async () => {
    expect(await ledger.getById("missing")).toBeNull();
    await ledger.append(makeCandidate({ candidateId: "c1" }));
    expect(await ledger.getById("c1")).not.toBeNull();
  });

  test("force 사용 시 reason 미지정 → throw", async () => {
    await ledger.append(makeCandidate({ candidateId: "c1" }));
    await ledger.decide("c1", "accepted");
    await expect(ledger.decide("c1", "rejected", { force: true })).rejects.toThrow(/reason 필수/);
  });
});
