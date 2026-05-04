import { parse as parseYaml } from "yaml";
import {
  SSL_VERSION,
  type Action,
  type ControlFlowFeature,
  type LogicalNode,
  type ResourceScope,
  type Scene,
  type SchedulingNode,
  type SSLDocument,
  type StructuralNode,
} from "../ontology/ssl";

// PR-V3.12 1차: heuristic-only normalizer.
// LLM 기반 normalizer (paper §3.3) 는 PR-V3.13 에서 layering.
//
// 입력: SKILL.md 텍스트 (frontmatter + 본문)
// 출력: SSLDocument — KG-Brain 의 본체 representation.

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;

const TRIGGER_HINTS: RegExp[] = [
  /Use when\s+([^.\n]+)/gi,
  /사용자가\s+([^.\n]+(?:할\s*때|하면|요청))/g,
  /when the user\s+([^.\n]+)/gi,
  /Triggers?:\s*([^\n]+)/gi,
];

const TOOL_RE = /\b(Read|Write|Edit|Bash|Glob|Grep|Task|WebFetch|WebSearch|TodoWrite|TaskCreate|TaskUpdate|SendMessage)\b/g;

// 헤더가 Scene 이름 자체이거나 (대소문자 무시) 동의어를 포함하면 매칭.
const SCENE_KEYWORDS: Array<{ scene: Scene; patterns: RegExp[] }> = [
  { scene: "PREPARE",  patterns: [/\bprepare\b|setup|init|준비|초기화/i] },
  { scene: "ACQUIRE",  patterns: [/\bacquire\b|fetch|gather|input|수집|읽기/i] },
  { scene: "REASON",   patterns: [/\breason\b|analyze|plan|decide|think|분석|계획|결정/i] },
  { scene: "ACT",      patterns: [/\bact\b|apply|implement|실행|적용/i] },
  { scene: "VERIFY",   patterns: [/\bverify\b|validate|check|test|검증|테스트/i] },
  { scene: "RECOVER",  patterns: [/\brecover\b|error|fail|rollback|fallback|실패|복구/i] },
  { scene: "FINALIZE", patterns: [/\bfinalize\b|finish|cleanup|report|complete|마무리|보고/i] },
];

function toolToAction(tool: string): { action: Action; resources: ResourceScope[] } {
  switch (tool) {
    case "Read":
    case "Glob":
    case "Grep":  return { action: "READ",      resources: ["LOCAL_FS"] };
    case "Write":
    case "Edit":  return { action: "WRITE",     resources: ["LOCAL_FS"] };
    case "Bash":  return { action: "CALL_TOOL", resources: ["LOCAL_FS", "NETWORK"] };
    case "WebFetch":
    case "WebSearch": return { action: "CALL_TOOL", resources: ["NETWORK"] };
    case "Task":  return { action: "CALL_TOOL", resources: ["MEMORY"] };
    case "TodoWrite":
    case "TaskCreate":
    case "TaskUpdate":
    case "SendMessage": return { action: "EMIT", resources: ["MEMORY"] };
    default: return { action: "CALL_TOOL", resources: ["MEMORY"] };
  }
}

export type NormalizeInput = {
  skillPath: string;
  source: string;
  sourceSha256: string;
  generatedAt: string;
};

export class SkillNormalizer {
  normalize(input: NormalizeInput): SSLDocument {
    const warnings: string[] = [];
    const fm = this.parseFrontmatter(input.source, warnings);
    const body = fm.body;
    const slug = this.slugFromPath(input.skillPath);
    const skillName = String(fm.data.name ?? slug);
    const description = String(fm.data.description ?? "");

    const intentSignatures = this.splitIntentSignatures(description);
    const scheduling: SchedulingNode = {
      id: `${slug}#scheduling`,
      skillName,
      skillGoal: intentSignatures[0] ?? "",
      intentSignature: intentSignatures[0] ?? "",
      intentSignatures,
      triggerPatterns: this.extractTriggers(description + "\n" + body),
      expectedInputs: this.extractListedSection(body, /inputs?/i),
      expectedOutputs: this.extractListedSection(body, /outputs?/i),
      dependencies: this.extractDependencies(body),
      controlFlowFeatures: this.detectControlFlowFeatures(body),
      ioContract: { inputsRaw: "", outputsRaw: "" },
      preconditions: [],
    };
    if (!scheduling.intentSignature) warnings.push("scheduling.intentSignature empty (LLM fill needed)");
    if (scheduling.triggerPatterns.length === 0) warnings.push("scheduling.triggerPatterns empty (LLM fill needed)");
    if (scheduling.expectedInputs.length === 0) warnings.push("scheduling.expectedInputs empty (LLM fill needed)");
    if (scheduling.expectedOutputs.length === 0) warnings.push("scheduling.expectedOutputs empty (LLM fill needed)");

    const sections = this.splitSections(body);
    const structural: StructuralNode[] = [];
    const logical: LogicalNode[] = [];
    let logicalSeq = 0;

    for (const sec of sections) {
      const scene = this.inferScene(sec.heading);
      if (!scene) continue;
      const sid = `${slug}#scene:${scene}:${structural.length + 1}`;
      const containsLogicalIds: string[] = [];

      const tools = new Set<string>();
      for (const m of sec.body.matchAll(TOOL_RE)) tools.add(m[1]);

      for (const tool of tools) {
        const { action, resources } = toolToAction(tool);
        const lid = `${slug}#logical:${++logicalSeq}`;
        logical.push({
          id: lid,
          action,
          description: `${tool} (heuristic from §"${sec.heading}")`,
          resources,
          resourceTarget: tool,
          effects: [],
          evidenceClaimIds: [],
        });
        containsLogicalIds.push(lid);
      }

      structural.push({
        id: sid,
        scene,
        sceneGoal: sec.heading,
        summary: sec.heading,
        containsLogicalIds,
        transitionsTo: [],
      });
    }

    for (let i = 0; i < structural.length - 1; i++) {
      structural[i].transitionsTo.push(structural[i + 1].id);
    }

    if (structural.length === 0) warnings.push("no scenes inferred from headings (LLM fill needed)");
    if (logical.length === 0)   warnings.push("no actions inferred from body (LLM fill needed)");

    return {
      sslVersion: SSL_VERSION,
      sourceSkillPath: input.skillPath,
      sourceSha256: input.sourceSha256,
      generatedAt: input.generatedAt,
      generatedBy: "heuristic",
      scheduling,
      structural,
      logical,
      warnings,
    };
  }

  private parseFrontmatter(src: string, warnings: string[]): { data: Record<string, unknown>; body: string } {
    const m = src.match(FRONTMATTER_RE);
    if (!m) {
      warnings.push("no YAML frontmatter — proceeding with empty metadata");
      return { data: {}, body: src };
    }
    try {
      const data = (parseYaml(m[1]) ?? {}) as Record<string, unknown>;
      return { data, body: m[2] };
    } catch (e) {
      warnings.push(`frontmatter parse failed: ${(e as Error).message}`);
      return { data: {}, body: m[2] };
    }
  }

  private extractTriggers(text: string): string[] {
    const out = new Set<string>();
    for (const re of TRIGGER_HINTS) {
      for (const m of text.matchAll(re)) {
        const v = m[1].trim().replace(/[.,;]+$/, "");
        if (v.length > 0 && v.length < 200) out.add(v);
      }
    }
    return [...out];
  }

  private splitSections(body: string): Array<{ heading: string; body: string }> {
    const lines = body.split("\n");
    const sections: Array<{ heading: string; body: string }> = [];
    let current: { heading: string; body: string[] } | null = null;
    for (const line of lines) {
      const h = line.match(/^#{2,3}\s+(.+?)\s*$/);
      if (h) {
        if (current) sections.push({ heading: current.heading, body: current.body.join("\n") });
        current = { heading: h[1], body: [] };
      } else if (current) {
        current.body.push(line);
      }
    }
    if (current) sections.push({ heading: current.heading, body: current.body.join("\n") });
    return sections;
  }

  private inferScene(heading: string): Scene | null {
    for (const { scene, patterns } of SCENE_KEYWORDS) {
      if (patterns.some((p) => p.test(heading))) return scene;
    }
    return null;
  }

  private splitIntentSignatures(description: string): string[] {
    const out: string[] = [];
    for (const piece of description.split(/(?:\.\s|。\s|;\s|—\s|—|\n)/)) {
      const trimmed = piece.trim().replace(/[.;]+$/, "");
      if (trimmed.length === 0 || trimmed.length > 200) continue;
      out.push(trimmed);
    }
    return out.slice(0, 5); // cap to avoid noise
  }

  private extractListedSection(body: string, headingRe: RegExp): string[] {
    // Match section like "## Inputs" or "**Inputs:**" then collect bullet items
    const lines = body.split("\n");
    const out: string[] = [];
    let inSection = false;
    for (const line of lines) {
      const heading = line.match(/^#{2,4}\s+(.+?)\s*$/) ?? line.match(/^\*\*(.+?):\*\*/);
      if (heading) {
        inSection = headingRe.test(heading[1]);
        continue;
      }
      if (!inSection) continue;
      const bullet = line.match(/^\s*[-*]\s+`?(\w+)`?/);
      if (bullet) out.push(bullet[1]);
    }
    return out;
  }

  private extractDependencies(body: string): string[] {
    // Capture backtick-quoted identifiers and `Use ... <Tool>` mentions
    const out = new Set<string>();
    for (const m of body.matchAll(/`([a-zA-Z_][\w-]{2,40})`/g)) {
      const v = m[1];
      if (/^(true|false|null|undefined)$/i.test(v)) continue;
      out.add(v);
    }
    return [...out].slice(0, 20);
  }

  private detectControlFlowFeatures(body: string): ControlFlowFeature[] {
    const feats = new Set<ControlFlowFeature>();
    if (/\b(if|else|when|switch|branch|either)\b/i.test(body)) feats.add("branching");
    if (/\b(for each|loop|iterate|while|until)\b/i.test(body)) feats.add("loop");
    if (/\b(retry|backoff|schedule|cron)\b/i.test(body)) feats.add("scheduled_retry");
    if (/\b(http|fetch|request|api|url|curl|webhook)\b/i.test(body)) feats.add("network_access");
    if (/\b(token|secret|credential|auth|api[_ -]?key)\b/i.test(body)) feats.add("credential_access");
    if (/\b(long.?running|background|daemon)\b/i.test(body)) feats.add("long_running");
    if (/\b(state|persist|store|database|sqlite)\b/i.test(body)) feats.add("stateful");
    return [...feats];
  }

  private slugFromPath(p: string): string {
    const base = p.split("/").filter(Boolean).pop() ?? "skill";
    return base.replace(/\.md$/i, "").replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase();
  }
}
