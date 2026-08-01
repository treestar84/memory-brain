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

  test("list — recordedAt 이 파일 순서와 어긋나도(git union merge 시뮬레이션) 최신 recordedAt 이 승자", async () => {
    // 두 '머신'이 각각 다른 시점에 같은 candidateId 를 append 하고, git 이
    // union merge 로 줄을 합칠 때 실제 시간순과 다르게 배치된 상황을 재현 —
    // 파일상으로는 오래된 레코드가 나중 줄에 온다.
    const older: ClaimCandidate = makeCandidate({ status: "pending", recordedAt: "2026-04-26T00:00:00Z" });
    const newer: ClaimCandidate = makeCandidate({ status: "accepted", recordedAt: "2026-04-26T00:05:00Z" });
    await storage.appendJsonl("memory/claims/ledger.jsonl", newer); // 실제로 더 나중에 기록된 것
    await storage.appendJsonl("memory/claims/ledger.jsonl", older); // merge 로 인해 파일상 뒤에 옴

    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.status).toBe("accepted"); // 파일 순서(older 가 마지막 줄)가 아니라 recordedAt 이 이김
  });

  test("list — 한쪽만 recordedAt 있으면(마이그레이션 경계) 파일 순서와 무관하게 recordedAt 있는 쪽이 항상 승자", async () => {
    // 실사용 시나리오: claim 이 이 기능 배포 전에 생성(recordedAt 없음)됐다가,
    // 배포 후 처음 supersede/decide 되면 그 새 레코드만 recordedAt 을 갖는다.
    // union merge 로 줄 순서가 뒤집혀도(레코드 없는 쪽이 파일상 뒤에 옴) 최신
    // (recordedAt 있는) 레코드가 이겨야 한다 — 검증에서 실제로 잡힌 회귀.
    const legacy: ClaimCandidate = makeCandidate({ status: "pending" }); // recordedAt 없음
    const migrated: ClaimCandidate = makeCandidate({ status: "accepted", recordedAt: "2026-04-26T00:05:00Z" });

    await storage.appendJsonl("memory/claims/ledger.jsonl", migrated); // 실제로 나중에 append
    await storage.appendJsonl("memory/claims/ledger.jsonl", legacy); // merge 로 파일상 legacy 가 뒤에 옴

    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.status).toBe("accepted"); // recordedAt 있는 쪽이 이김, 파일 순서 무관
  });

  test("list — recordedAt 없는 레코드(마이그레이션 이전)는 기존처럼 파일 순서 last-wins", async () => {
    await storage.appendJsonl("memory/claims/ledger.jsonl", makeCandidate({ status: "pending" }));
    await storage.appendJsonl("memory/claims/ledger.jsonl", makeCandidate({ status: "accepted" }));
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.status).toBe("accepted"); // recordedAt 둘 다 없음 → 파일상 마지막 줄이 이김 (기존 동작)
  });

  test("append — recordedAt 을 자동으로 찍는다 (동일 clock 이라도 append 마다 채움)", async () => {
    await store.append(makeCandidate());
    const [stored] = await storage.readJsonl<ClaimCandidate>("memory/claims/ledger.jsonl");
    expect(stored!.recordedAt).toBe("2026-04-26T00:00:00.000Z");
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

  // PR-A1.1 — decide

  test("decide accept → status accepted + decidedAt + decidedBy + validFrom 자동 설정", async () => {
    await store.append(makeCandidate({ candidateId: "d1", status: "pending" }));
    const updated = await store.decide("d1", "accepted", { decidedBy: "claude" });

    expect(updated.status).toBe("accepted");
    expect(updated.decidedBy).toBe("claude");
    expect(updated.decidedAt).toBeTruthy();
    expect(updated.validFrom).toBeTruthy();

    const persisted = await store.getById("d1");
    expect(persisted!.status).toBe("accepted");
  });

  test("decide reject → status rejected, validFrom 미설정", async () => {
    await store.append(makeCandidate({ candidateId: "d2", status: "pending" }));
    const updated = await store.decide("d2", "rejected", { reason: "noisy" });
    expect(updated.status).toBe("rejected");
    expect(updated.reason).toBe("noisy");
    expect(updated.validFrom).toBeUndefined();
  });

  test("decide — 미존재 → 에러", async () => {
    await expect(store.decide("nope", "accepted")).rejects.toThrow("not found");
  });

  test("decide — 이미 decided + force 없음 → 에러", async () => {
    await store.append(makeCandidate({ candidateId: "d3", status: "accepted" }));
    await expect(store.decide("d3", "rejected")).rejects.toThrow("이미 결정됨");
  });

  test("decide --force 만 있고 --reason 없음 → 에러", async () => {
    await store.append(makeCandidate({ candidateId: "d4", status: "accepted" }));
    await expect(store.decide("d4", "rejected", { force: true })).rejects.toThrow("--reason 필수");
  });

  test("decide --force --reason 으로 reversal → 정상", async () => {
    await store.append(makeCandidate({ candidateId: "d5", status: "accepted" }));
    const reversed = await store.decide("d5", "rejected", {
      force: true,
      reason: "오인 승인 회수",
    });
    expect(reversed.status).toBe("rejected");
    expect(reversed.reason).toBe("오인 승인 회수");
  });
});
