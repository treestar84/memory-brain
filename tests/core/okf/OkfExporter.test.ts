import { describe, test, expect } from "bun:test";
import yaml from "yaml";
import { toOkfDocument, buildOkfBundle } from "../../../src/core/okf/OkfExporter";
import type { WikiPage } from "../../../src/core/wiki/types";

function page(overrides: Partial<WikiPage["frontmatter"]> & { id: string }, body: string): WikiPage {
  const type = (overrides.type ?? "concept") as WikiPage["frontmatter"]["type"];
  return {
    path: `${type}s/${overrides.id.split(".")[1]}.md`,
    frontmatter: {
      type,
      status: "active",
      updated_at: "2026-07-21",
      ...overrides,
    } as WikiPage["frontmatter"],
    body,
    claimIds: [],
    evidence: [],
  };
}

const ROUTING = page(
  { id: "concept.memory-routing", type: "concept", tags: ["router", "policy"], confidence: "high" },
  `# Memory Routing\n\n## Summary\n\n<!-- claim:cl-route-001 -->\n요청 분류 후 lane 을 선택한다.\n\n## Related\n\n- [[decision.oss-incorporation]] — OSS 결정\n- [[concept.unknown-page]] — 미존재\n`,
);

const OSS = page(
  { id: "decision.oss-incorporation", type: "decision", supersedes: ["decision.old-oss"] },
  `# OSS Incorporation\n\nHoncho 는 pattern-only 로 계승한다. [[concept.memory-routing]] 참조.\n`,
);

describe("OkfExporter (V3.28, OKF v0.1)", () => {
  const known = new Set(["concept.memory-routing", "decision.oss-incorporation"]);

  test("frontmatter — type 필수 + OKF 표준 필드 정렬", () => {
    const doc = toOkfDocument(ROUTING, known);
    expect(doc.relPath).toBe("concepts/memory-routing.md");
    const fmText = doc.content.split("---")[1]!;
    const fm = yaml.parse(fmText);
    expect(fm.type).toBe("concept");
    expect(fm.title).toBe("Memory Routing");
    expect(fm.description).toBe("요청 분류 후 lane 을 선택한다.");
    expect(fm.resource).toBe("memory/concepts/memory-routing.md");
    expect(fm.tags).toEqual(["router", "policy"]);
    expect(fm.timestamp).toBe("2026-07-21");
  });

  test("provenance — x_cfgm_* 확장 필드 보존", () => {
    const fm = yaml.parse(toOkfDocument(ROUTING, known).content.split("---")[1]!);
    expect(fm.x_cfgm_id).toBe("concept.memory-routing");
    expect(fm.x_cfgm_status).toBe("active");
    expect(fm.x_cfgm_confidence).toBe("high");
    const oss = yaml.parse(toOkfDocument(OSS, known).content.split("---")[1]!);
    expect(oss.x_cfgm_supersedes).toEqual(["decision.old-oss"]);
  });

  test("[[id]] 링크 — export 집합 내 id 는 상대 링크, 미존재 id 는 원형 유지", () => {
    const doc = toOkfDocument(ROUTING, known);
    expect(doc.content).toContain("[decision.oss-incorporation](../decisions/oss-incorporation.md)");
    expect(doc.content).toContain("[[concept.unknown-page]]");
  });

  test("[[id]] 링크 — 같은 디렉토리 내 링크는 ../ 없이", () => {
    const sibling = page({ id: "concept.other" }, "See [[concept.memory-routing]].");
    const doc = toOkfDocument(sibling, new Set([...known, "concept.other"]));
    expect(doc.content).toContain("[concept.memory-routing](memory-routing.md)");
  });

  test("Summary 없는 페이지 — 첫 본문 문단이 description", () => {
    const fm = yaml.parse(toOkfDocument(OSS, known).content.split("---")[1]!);
    expect(fm.description).toContain("Honcho");
  });

  test("bundle — concept 문서 + dir index + root index", () => {
    const files = buildOkfBundle([ROUTING, OSS]);
    const paths = files.map((f) => f.relPath).sort();
    expect(paths).toEqual([
      "concepts/index.md",
      "concepts/memory-routing.md",
      "decisions/index.md",
      "decisions/oss-incorporation.md",
      "index.md",
    ]);
    const rootIndex = files.find((f) => f.relPath === "index.md")!;
    expect(rootIndex.content).toContain("type: Index");
    expect(rootIndex.content).toContain("[concepts](concepts/index.md)");
    const dirIndex = files.find((f) => f.relPath === "concepts/index.md")!;
    expect(dirIndex.content).toContain("[Memory Routing](memory-routing.md)");
  });

  test("bundle — includeAllStatuses=false 는 active/draft 만", () => {
    const archived = page({ id: "concept.old", status: "archived" }, "# Old\n\nOld content.");
    const files = buildOkfBundle([ROUTING, archived], { includeAllStatuses: false });
    expect(files.some((f) => f.relPath === "concepts/old.md")).toBe(false);
    expect(files.some((f) => f.relPath === "concepts/memory-routing.md")).toBe(true);
  });

  test("bundle — 결정론적 정렬 (id 사전순)", () => {
    const a = buildOkfBundle([OSS, ROUTING]).map((f) => f.relPath);
    const b = buildOkfBundle([ROUTING, OSS]).map((f) => f.relPath);
    expect(a).toEqual(b);
  });
});
