import type { MemoryLane } from "./types";

/**
 * Keyword/symbol → lane → file path 매핑 (PR-V3.10).
 *
 * 사용자 지적 (2026-04-29): "keyword → file 매핑이 실제로 잘 동작해야 한다.
 * @ 형태는 안 된다." 본 모듈이 실제 path 문자열을 반환 — markdown link
 * 또는 plain path 로 활용.
 *
 * `memory/ROUTER.md` 의 매핑 표는 본 모듈 의 view (사람 읽는 형태).
 * 코드가 truth-source.
 */

export interface RouterMappingRule {
  /** 매칭 정규식 (i flag 권장) */
  pattern: RegExp;
  lanes: MemoryLane[];
  /** 정적 파일 경로 (repo root 기준 상대) */
  files: string[];
  /** 매칭 후 동적 파일 경로 생성 (예: ADR 번호 → docs/adr/N-*.md) */
  dynamicFiles?: (text: string) => string[];
  description: string;
}

export const ROUTER_MAPPINGS: readonly RouterMappingRule[] = [
  {
    pattern: /\bPR-?V?\d+(?:\.\d+)?|phase\s*\w+/i,
    lanes: ["current", "project"],
    files: ["memory/current.md", "memory/projects/memory-brain.md"],
    description: "PR / phase",
  },
  {
    pattern: /\bADR-?\d+/i,
    lanes: ["decision"],
    files: [],
    dynamicFiles: (text) => {
      const re = /\bADR-?(\d+)/gi;
      const out: string[] = [];
      for (const m of text.matchAll(re)) {
        const padded = m[1]!.padStart(3, "0");
        out.push(`docs/adr/${padded}-*.md`);
      }
      return out;
    },
    description: "ADR 번호 (동적 path)",
  },
  {
    pattern: /\bvision\b|(?<![가-힣A-Za-z])비전(?![가-힣A-Za-z])/i,
    lanes: ["concept"],
    files: ["memory_system_improvement_prompt.md", "memory/SCHEMA.md"],
    description: "vision / 비전",
  },
  {
    pattern: /\b(OSS|Honcho|OpenClaw|Graphiti)\b|(?<![가-힣A-Za-z])오픈\s?소스(?![가-힣A-Za-z])/i,
    lanes: ["decision", "research"],
    files: [
      "memory/decisions/oss-incorporation.md",
      "docs/adr/019-oss-incorporation.md",
      "docs/adr/021-honcho-pattern-only.md",
    ],
    description: "OSS / Honcho / OpenClaw / Graphiti",
  },
  {
    pattern: /\b(claim|evidence|supersede)\b/i,
    lanes: ["decision", "concept"],
    files: [
      "memory/decisions/oss-incorporation.md",
      "docs/adr/012-claim-evidence-sidecar.md",
      "src/core/claim/ClaimStore.ts",
    ],
    description: "claim / evidence / supersede",
  },
  {
    pattern: /\b(persona|representation|9-?file|PAI)\b/i,
    lanes: ["persona"],
    files: [
      "memory/profile/README.md",
      "src/core/persona/PersonaStore.ts",
    ],
    description: "persona / representation / 9-file / PAI",
  },
  {
    pattern: /\b(7-?layer|bootloader|router)\b/i,
    lanes: ["concept"],
    files: [
      "memory/SCHEMA.md",
      "memory/concepts/memory-routing.md",
      "CLAUDE.md",
      "MEMORY.md",
    ],
    description: "7-layer / bootloader / router",
  },
  {
    pattern: /\b(governance|report|lint|duplicate|stale|contradiction)\b/i,
    lanes: ["governance"],
    files: [
      "src/core/governance/reports/types.ts",
      "docs/adr/018-phase-entry-gate-meta.md",
    ],
    description: "governance / report / lint",
  },
  {
    pattern: /\b(index|search|sqlite|FTS)\b/i,
    lanes: ["concept", "code"],
    files: ["src/core/search/SearchIndex.ts", "bin/cfgm-rebuild-index.ts"],
    description: "index / search / sqlite / FTS",
  },
  {
    pattern: /\b(learning|loop|auto-?trigger)\b/i,
    lanes: ["concept", "code"],
    files: ["src/core/auto-trigger/AutoTrigger.ts"],
    description: "learning / loop / auto-trigger",
  },
  {
    pattern: /\b(bun|bunfig|bun:sqlite)\b/i,
    lanes: ["code"],
    files: ["CLAUDE.md", "package.json"],
    description: "bun runtime / bun:sqlite",
  },
];

export interface RouterMappingResolution {
  lanes: MemoryLane[];
  files: string[];
  matchedRules: string[];
}

export class RouterMappings {
  constructor(
    private readonly rules: readonly RouterMappingRule[] = ROUTER_MAPPINGS,
  ) {}

  resolve(text: string): RouterMappingResolution {
    const lanes = new Set<MemoryLane>();
    const files = new Set<string>();
    const matched: string[] = [];

    for (const rule of this.rules) {
      if (rule.pattern.test(text)) {
        for (const l of rule.lanes) lanes.add(l);
        for (const f of rule.files) files.add(f);
        if (rule.dynamicFiles) {
          for (const f of rule.dynamicFiles(text)) files.add(f);
        }
        matched.push(rule.description);
      }
    }

    return {
      lanes: Array.from(lanes),
      files: Array.from(files),
      matchedRules: matched,
    };
  }
}
