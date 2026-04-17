import { describe, test, expect } from "bun:test";
import { CueCardFallback } from "../../../src/core/flow/CueCardFallback";
import type { ObservationBundle } from "../../../src/core/flow/types";

const mkBundle = (id: string, sealedAt: string, touched: string[] = [], tools: Record<string, number> = {}): ObservationBundle => ({
  bundleId: id, activeProblemId: "p1", sessionId: "s", turnOrdinal: 1,
  openedAt: sealedAt, sealedAt, eventIds: [], observations: [],
  metrics: { toolCallCounts: tools, touchedFiles: touched, bashExit: { success: 0, failure: 0 }, promptCount: 0 },
  recentBlockIds: [], processedAt: null, processedByVersion: null,
});

describe("CueCardFallback", () => {
  const fb = new CueCardFallback();

  test("generate produces YAML front matter + body", () => {
    const bundles = [mkBundle("b1", "2026-04-18T10:00:00Z", ["a.ts"], { "tool:Edit": 2 })];
    const md = fb.generate("p1", "auth bug", bundles);
    expect(md).toContain("---");
    expect(md).toContain("problemId: p1");
    expect(md).toContain("awaitingSynthesis: true");
    expect(md).toContain("pendingBundleCount: 1");
    expect(md).toContain("## 활동 지표");
  });

  test("generate aggregates metrics across bundles", () => {
    const bundles = [
      mkBundle("b1", "2026-04-18T10:00:00Z", ["a.ts", "b.ts"], { "tool:Edit": 1 }),
      mkBundle("b2", "2026-04-18T11:00:00Z", ["a.ts", "c.ts"], { "tool:Bash": 2 }),
    ];
    const md = fb.generate("p1", "bug", bundles);
    expect(md).toContain("a.ts");
    expect(md).toContain("b.ts");
    expect(md).toContain("c.ts");
    expect(md).toContain("tool:Edit");
    expect(md).toContain("tool:Bash");
  });

  test("generate with empty bundles still emits header", () => {
    const md = fb.generate("p1", "t", []);
    expect(md).toContain("pendingBundleCount: 0");
  });

  test("generate never truncates file paths or numbers (no judgement)", () => {
    const veryLongPath = "src/this/is/a/really/long/path/to/file/that/should/never/be/truncated.ts";
    const bundles = [mkBundle("b1", "2026-04-18T10:00:00Z", [veryLongPath], {})];
    const md = fb.generate("p1", "bug", bundles);
    expect(md).toContain(veryLongPath);
  });

  test("generate ranks touched files by frequency", () => {
    const bundles = [
      mkBundle("b1", "2026-04-18T10:00:00Z", ["common.ts", "rare.ts"], {}),
      mkBundle("b2", "2026-04-18T11:00:00Z", ["common.ts"], {}),
      mkBundle("b3", "2026-04-18T12:00:00Z", ["common.ts"], {}),
    ];
    const md = fb.generate("p1", "bug", bundles);
    const commonIdx = md.indexOf("common.ts");
    const rareIdx = md.indexOf("rare.ts");
    expect(commonIdx).toBeGreaterThan(-1);
    expect(rareIdx).toBeGreaterThan(commonIdx);
  });
});
