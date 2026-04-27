import { describe, test, expect } from "bun:test";
import { DuplicateCandidatesDetector } from "../../../../src/core/governance/reports/DuplicateCandidatesDetector";
import { StaleClaimsDetector } from "../../../../src/core/governance/reports/StaleClaimsDetector";
import { ContradictionsDetector } from "../../../../src/core/governance/reports/ContradictionsDetector";
import { LowConfidenceDetector } from "../../../../src/core/governance/reports/LowConfidenceDetector";
import { ReviewQueueDetector } from "../../../../src/core/governance/reports/ReviewQueueDetector";
import { ReportWriter } from "../../../../src/core/governance/reports/ReportWriter";
import { MemoryStorage } from "../../../../src/core/storage/MemoryStorage";
import type { ClaimCandidate } from "../../../../src/core/claim/types";
import type { GovernanceInput } from "../../../../src/core/governance/reports/types";

const NOW = "2026-04-28T00:00:00Z";

function makeClaim(overrides: Partial<ClaimCandidate> = {}): ClaimCandidate {
  return {
    candidateId: "c1",
    bundleId: "b1",
    blockId: "blk-1",
    proposedType: "outcome",
    proposedText: "기본 진술",
    detectedBy: "rule",
    confidence: 0.9,
    evidence: [{ source: "src", quote: "q" }],
    status: "accepted",
    createdAt: NOW,
    decidedAt: NOW,
    decidedBy: "user",
    reason: null,
    ...overrides,
  };
}

function input(claims: ClaimCandidate[], now = NOW): GovernanceInput {
  return { claims, wikiPages: [], now };
}

describe("DuplicateCandidatesDetector", () => {
  const d = new DuplicateCandidatesDetector();

  test("같은 텍스트 2건 → finding 1", () => {
    const r = d.detect(
      input([
        makeClaim({ candidateId: "a", proposedText: "동일 진술", status: "pending" }),
        makeClaim({ candidateId: "b", proposedText: "동일 진술", status: "pending" }),
      ]),
    );
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.evidence).toEqual(["a", "b"]);
  });

  test("rejected/superseded 는 제외", () => {
    const r = d.detect(
      input([
        makeClaim({ candidateId: "a", proposedText: "x", status: "rejected" }),
        makeClaim({ candidateId: "b", proposedText: "x", status: "pending" }),
      ]),
    );
    expect(r.findings).toHaveLength(0);
  });

  test("NFKC normalize — 같은 한글 표기 변형 매치", () => {
    const r = d.detect(
      input([
        makeClaim({ candidateId: "a", proposedText: "테스트 진술" }),
        makeClaim({ candidateId: "b", proposedText: "테스트 진술 " }), // trailing space
      ]),
    );
    expect(r.findings).toHaveLength(1);
  });

  test("중복 없음 → 빈 findings + 친화적 summary", () => {
    const r = d.detect(input([makeClaim({ proposedText: "유일" })]));
    expect(r.findings).toEqual([]);
    expect(r.summary).toContain("없음");
  });
});

describe("StaleClaimsDetector", () => {
  const d = new StaleClaimsDetector();

  test("60일 이상 + accepted → finding", () => {
    const r = d.detect(
      input([
        makeClaim({ createdAt: "2026-01-01T00:00:00Z", status: "accepted" }), // ~117일 전
      ]),
    );
    expect(r.findings).toHaveLength(1);
  });

  test("60일 미만 → 제외", () => {
    const r = d.detect(input([makeClaim({ createdAt: "2026-04-15T00:00:00Z" })]));
    expect(r.findings).toEqual([]);
  });

  test("accepted 가 아닌 claim 은 제외", () => {
    const r = d.detect(
      input([
        makeClaim({ createdAt: "2025-12-01T00:00:00Z", status: "rejected" }),
        makeClaim({ createdAt: "2025-12-01T00:00:00Z", status: "pending" }),
      ]),
    );
    expect(r.findings).toEqual([]);
  });
});

describe("ContradictionsDetector", () => {
  const d = new ContradictionsDetector();

  test("같은 blockId 2 accepted + supersede 미설정 → finding", () => {
    const r = d.detect(
      input([
        makeClaim({ candidateId: "a", blockId: "blk-x", proposedText: "v1" }),
        makeClaim({ candidateId: "b", blockId: "blk-x", proposedText: "v2" }),
      ]),
    );
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.subject).toBe("blk-x");
  });

  test("supersede 관계 명시 → finding 안 만듬", () => {
    const r = d.detect(
      input([
        makeClaim({ candidateId: "a", blockId: "blk-x", supersededBy: "b" }),
        makeClaim({ candidateId: "b", blockId: "blk-x", supersededBy: "a" }),
      ]),
    );
    expect(r.findings).toEqual([]);
  });

  test("invalidAt 설정된 claim 제외", () => {
    const r = d.detect(
      input([
        makeClaim({ candidateId: "a", blockId: "blk-x", invalidAt: NOW }),
        makeClaim({ candidateId: "b", blockId: "blk-x" }),
      ]),
    );
    expect(r.findings).toEqual([]);
  });
});

describe("LowConfidenceDetector", () => {
  const d = new LowConfidenceDetector();

  test("confidence < 0.5 → info finding", () => {
    const r = d.detect(input([makeClaim({ confidence: 0.3 })]));
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.severity).toBe("info");
  });

  test("evidence 비어있음 → warning finding", () => {
    const r = d.detect(input([makeClaim({ evidence: [], confidence: 0.9 })]));
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.severity).toBe("warning");
  });

  test("정상 (confidence ≥ 0.5 + evidence 있음) → 빈 findings", () => {
    const r = d.detect(input([makeClaim()]));
    expect(r.findings).toEqual([]);
  });

  test("pending claim 은 검사 대상 아님", () => {
    const r = d.detect(input([makeClaim({ confidence: 0.1, status: "pending" })]));
    expect(r.findings).toEqual([]);
  });
});

describe("ReviewQueueDetector", () => {
  const d = new ReviewQueueDetector();

  test("7일+ pending → finding", () => {
    const r = d.detect(
      input([
        makeClaim({
          createdAt: "2026-04-15T00:00:00Z", // ~13일 전
          status: "pending",
        }),
      ]),
    );
    expect(r.findings).toHaveLength(1);
  });

  test("14일+ pending → severity warning", () => {
    const r = d.detect(
      input([
        makeClaim({
          createdAt: "2026-04-10T00:00:00Z", // ~18일 전
          status: "pending",
        }),
      ]),
    );
    expect(r.findings[0]!.severity).toBe("warning");
  });

  test("7일 미만 → 제외", () => {
    const r = d.detect(
      input([
        makeClaim({
          createdAt: "2026-04-25T00:00:00Z",
          status: "pending",
        }),
      ]),
    );
    expect(r.findings).toEqual([]);
  });

  test("non-pending 제외", () => {
    const r = d.detect(
      input([
        makeClaim({
          createdAt: "2026-04-01T00:00:00Z",
          status: "accepted",
        }),
      ]),
    );
    expect(r.findings).toEqual([]);
  });
});

describe("ReportWriter", () => {
  test("toMarkdown — findings 없음 → '(없음)'", () => {
    const w = new ReportWriter(new MemoryStorage());
    const md = w.toMarkdown({
      detectorId: "test",
      generatedAt: NOW,
      findings: [],
      summary: "OK",
    });
    expect(md).toContain("# test");
    expect(md).toContain("(없음)");
  });

  test("toMarkdown — finding 1 → severity / subject / message 포함", () => {
    const w = new ReportWriter(new MemoryStorage());
    const md = w.toMarkdown({
      detectorId: "test",
      generatedAt: NOW,
      findings: [
        {
          severity: "warning",
          subject: "claim-x",
          message: "duplicate detected",
          evidence: ["a", "b"],
        },
      ],
      summary: "1 finding",
    });
    expect(md).toContain("[WARNING]");
    expect(md).toContain("claim-x");
    expect(md).toContain("duplicate detected");
    expect(md).toContain("- a");
    expect(md).toContain("- b");
  });

  test("write — storage 에 저장", async () => {
    const storage = new MemoryStorage();
    const w = new ReportWriter(storage);
    const path = await w.write({
      detectorId: "duplicate-candidates",
      generatedAt: NOW,
      findings: [],
      summary: "OK",
    });
    expect(path).toBe("reports/duplicate-candidates.md");
    const text = await storage.readText(path);
    expect(text).toContain("# duplicate-candidates");
  });
});
