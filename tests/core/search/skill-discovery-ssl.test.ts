import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { SearchIndex } from "../../../src/core/search/SearchIndex";
import { SkillNormalizer } from "../../../src/core/normalizer/SkillNormalizer";
import type { SSLDocument } from "../../../src/core/ontology/ssl";

const DEBUG_SKILL = `---
name: debug-test-failures
description: Debug failing tests and stack traces. Use when the user reports test failures, build errors, or stack traces.
---

# Debug Skill

## Acquire

Read the failing test file and Grep for the error message in the source.

## Reason

Analyze the stack trace, form a hypothesis about the failure cause.

## Act

Edit the source file to apply the fix.

## Verify

Run Bash to re-execute the tests and confirm they pass.
`;

const DESIGN_SKILL = `---
name: design-ui-layout
description: Design responsive UI layouts. Use when the user asks for layout design, UI components, or visual hierarchy.
---

# Design Skill

## Prepare

Read existing component patterns in the codebase.

## Reason

Plan the layout structure and visual hierarchy.

## Act

Write new component files with Tailwind classes.

## Verify

Use Bash to start the dev server and check the layout in the browser.
`;

const DOCS_SKILL = `---
name: write-api-docs
description: Write API reference documentation. Use when the user asks to document an API, endpoint, or SDK function.
---

# Docs Skill

## Acquire

Read the source files for the API being documented.

## Act

Write markdown reference pages.

## Finalize

Report the doc file paths back to the user.
`;

function normalize(name: string, src: string): SSLDocument {
  return new SkillNormalizer().normalize({
    skillPath: `/skills/${name}.md`,
    source: src,
    sourceSha256: name,
    generatedAt: "2026-05-05T00:00:00Z",
  });
}

describe("SearchIndex.searchSkills (PR-V3.14, paper §4.1 rich-field weighted)", () => {
  let index: SearchIndex;

  beforeEach(() => {
    index = new SearchIndex(":memory:");
    index.rebuild({
      wikiPages: [],
      claims: [],
      skills: [
        normalize("debug-test-failures", DEBUG_SKILL),
        normalize("design-ui-layout", DESIGN_SKILL),
        normalize("write-api-docs", DOCS_SKILL),
      ],
    });
  });

  afterEach(() => index.close());

  test("intent-aligned query → matching skill ranks first", () => {
    const hits = index.searchSkills("test failure stack trace");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].skillName).toBe("debug-test-failures");
  });

  test("UI-intent query → design skill ranks first", () => {
    const hits = index.searchSkills("layout component visual");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].skillName).toBe("design-ui-layout");
  });

  test("documentation-intent query → docs skill ranks first", () => {
    const hits = index.searchSkills("API documentation reference");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].skillName).toBe("write-api-docs");
  });

  test("Scheduling-layer match outranks Logical-only match", () => {
    // 'Bash' appears as a Logical action in BOTH debug + design skills.
    // The debug skill's *intent* is about test failures — when query targets
    // intent ("test failure"), Scheduling weight (3.0) must dominate the
    // Logical co-occurrence (1.0) so debug ranks above design.
    const hits = index.searchSkills("test failure");
    const debugRank = hits.findIndex((h) => h.skillName === "debug-test-failures");
    const designRank = hits.findIndex((h) => h.skillName === "design-ui-layout");
    expect(debugRank).toBeGreaterThanOrEqual(0);
    if (designRank >= 0) {
      expect(debugRank).toBeLessThan(designRank);
    }
  });

  test("limit option respected", () => {
    const hits = index.searchSkills("Read", { limit: 1 });
    expect(hits.length).toBeLessThanOrEqual(1);
  });

  test("hits expose intentSignature for UX surfacing", () => {
    const hits = index.searchSkills("failing tests");
    expect(hits[0].intentSignature.length).toBeGreaterThan(0);
    expect(hits[0].sourcePath).toMatch(/debug-test-failures\.md$/);
  });

  test("empty index → empty result, no crash", () => {
    const empty = new SearchIndex(":memory:");
    empty.rebuild({ wikiPages: [], claims: [], skills: [] });
    expect(empty.searchSkills("anything")).toEqual([]);
    empty.close();
  });

  test("rebuild without skills key stays back-compat", () => {
    const idx = new SearchIndex(":memory:");
    // No `skills` key — must not throw, ssl_skills table just empty.
    idx.rebuild({ wikiPages: [], claims: [] });
    expect(idx.searchSkills("anything")).toEqual([]);
    idx.close();
  });
});
