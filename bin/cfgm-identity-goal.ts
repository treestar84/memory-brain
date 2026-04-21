import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { parse, stringify } from "yaml";

const HOME = process.env.HOME!;
const BRAIN_HOME = process.env.CFGM_BRAIN_HOME || join(HOME, ".claude-brain");
const IDENTITY_HOME = join(BRAIN_HOME, "memory-brain", "identity");
const GOALS_HOME = join(IDENTITY_HOME, "goals");
const INDEX_PATH = join(GOALS_HOME, "_index.md");
const INDEX_BEGIN = "<!-- GOALS-INDEX:BEGIN auto-generated -->";
const INDEX_END = "<!-- GOALS-INDEX:END -->";
const BUDGET_BYTES = 20 * 1024;

type GoalStatus = "planned" | "in-progress" | "on-hold" | "done" | "abandoned";

export type GoalFrontmatter = {
  id: string;
  title: string;
  status: GoalStatus;
  priority: "low" | "medium" | "high";
  createdAt: string;
  targetDate: string | null;
  completedAt: string | null;
  relatedProblems: string[];
};

function goalPath(id: string): string {
  return join(GOALS_HOME, `${id}.md`);
}

function validId(id: string): boolean {
  return /^[a-z0-9][a-z0-9-_]{0,63}$/.test(id);
}

function nowIso(): string {
  return new Date().toISOString();
}

export function serializeGoal(fm: GoalFrontmatter, body: string): string {
  const yaml = stringify(fm).trim();
  const bodyTrimmed = body.replace(/^\s+/, "");
  return `---\n${yaml}\n---\n\n${bodyTrimmed}`;
}

export function parseGoal(content: string): { fm: GoalFrontmatter; body: string } | null {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;
  const [, yamlText, body] = match;
  const parsed = parse(yamlText);
  if (!parsed || typeof parsed !== "object") return null;
  const fm = parsed as Partial<GoalFrontmatter>;
  if (typeof fm.id !== "string" || typeof fm.title !== "string") return null;
  return {
    fm: {
      id: fm.id,
      title: fm.title,
      status: (fm.status as GoalStatus) ?? "planned",
      priority: (fm.priority as GoalFrontmatter["priority"]) ?? "medium",
      createdAt: fm.createdAt ?? nowIso(),
      targetDate: fm.targetDate ?? null,
      completedAt: fm.completedAt ?? null,
      relatedProblems: Array.isArray(fm.relatedProblems) ? fm.relatedProblems : [],
    },
    body: body ?? "",
  };
}

async function listGoals(): Promise<GoalFrontmatter[]> {
  if (!existsSync(GOALS_HOME)) return [];
  const entries = await readdir(GOALS_HOME);
  const goals: GoalFrontmatter[] = [];
  for (const name of entries) {
    if (!name.endsWith(".md") || name === "_index.md") continue;
    const content = await readFile(join(GOALS_HOME, name), "utf-8");
    const parsed = parseGoal(content);
    if (parsed) goals.push(parsed.fm);
  }
  goals.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return goals;
}

const STATUS_ORDER: GoalStatus[] = ["in-progress", "planned", "on-hold", "done", "abandoned"];
const STATUS_LABEL: Record<GoalStatus, string> = {
  "in-progress": "진행 중",
  "planned": "계획됨",
  "on-hold": "보류",
  "done": "완료",
  "abandoned": "중단",
};

export function renderIndex(goals: GoalFrontmatter[]): string {
  const lines: string[] = [INDEX_BEGIN, "# Long-term Goals", ""];
  if (goals.length === 0) {
    lines.push("(등록된 목표 없음. `bun run bin/cfgm-identity-goal.ts add \"<title>\" <id>`로 추가하세요.)");
  } else {
    const byStatus = new Map<GoalStatus, GoalFrontmatter[]>();
    for (const g of goals) {
      const arr = byStatus.get(g.status) ?? [];
      arr.push(g);
      byStatus.set(g.status, arr);
    }
    for (const s of STATUS_ORDER) {
      const arr = byStatus.get(s);
      if (!arr || arr.length === 0) continue;
      lines.push(`## ${STATUS_LABEL[s]} (${arr.length})`);
      for (const g of arr) {
        const problems = g.relatedProblems.length > 0 ? ` — problems: ${g.relatedProblems.join(", ")}` : "";
        const target = g.targetDate ? ` · target: ${g.targetDate}` : "";
        lines.push(`- **${g.title}** \`${g.id}\`${target}${problems}`);
      }
      lines.push("");
    }
  }
  lines.push(INDEX_END);
  return lines.join("\n") + "\n";
}

async function writeIndex(): Promise<void> {
  const goals = await listGoals();
  await writeFile(INDEX_PATH, renderIndex(goals));
}

async function cmdAdd(title: string, id: string): Promise<number> {
  if (!validId(id)) {
    console.error(`[cfgm-identity] 잘못된 id: ${id} (소문자/숫자/대시/언더스코어만, 최대 64자)`);
    return 2;
  }
  if (existsSync(goalPath(id))) {
    console.error(`[cfgm-identity] 이미 존재: ${id}`);
    return 2;
  }
  const fm: GoalFrontmatter = {
    id,
    title,
    status: "planned",
    priority: "medium",
    createdAt: nowIso(),
    targetDate: null,
    completedAt: null,
    relatedProblems: [],
  };
  const body = `# ${title}\n\n## Why\n\n## Success criteria\n\n## Notes\n`;
  await writeFile(goalPath(id), serializeGoal(fm, body));
  await writeIndex();
  console.log(`[cfgm-identity] goal 추가됨: ${id}`);
  return 0;
}

async function cmdDone(id: string): Promise<number> {
  const p = goalPath(id);
  if (!existsSync(p)) {
    console.error(`[cfgm-identity] goal 없음: ${id}`);
    return 2;
  }
  const content = await readFile(p, "utf-8");
  const parsed = parseGoal(content);
  if (!parsed) {
    console.error(`[cfgm-identity] goal 파싱 실패: ${id}`);
    return 2;
  }
  parsed.fm.status = "done";
  parsed.fm.completedAt = nowIso();
  await writeFile(p, serializeGoal(parsed.fm, parsed.body));
  await writeIndex();
  console.log(`[cfgm-identity] goal 완료: ${id}`);
  return 0;
}

async function problemExists(problemId: string): Promise<boolean> {
  const { resolveStorageRoot } = await import("../src/hooks/bootstrap");
  const statePath = join(resolveStorageRoot(), "state", "active-problem.json");
  if (!existsSync(statePath)) return false;
  try {
    const state = JSON.parse(await readFile(statePath, "utf-8"));
    if (!Array.isArray(state?.problems)) return false;
    return state.problems.some((p: { id?: string }) => p.id === problemId);
  } catch { return false; }
}

async function cmdLink(goalId: string, problemId: string): Promise<number> {
  const p = goalPath(goalId);
  if (!existsSync(p)) {
    console.error(`[cfgm-identity] goal 없음: ${goalId}`);
    return 2;
  }
  const content = await readFile(p, "utf-8");
  const parsed = parseGoal(content);
  if (!parsed) {
    console.error(`[cfgm-identity] goal 파싱 실패: ${goalId}`);
    return 2;
  }
  if (!parsed.fm.relatedProblems.includes(problemId)) {
    parsed.fm.relatedProblems.push(problemId);
    await writeFile(p, serializeGoal(parsed.fm, parsed.body));
    await writeIndex();
  }
  if (!(await problemExists(problemId))) {
    console.error(`[cfgm-identity] 경고: problem ${problemId}을(를) 현재 프로젝트에서 찾지 못함 (soft-ref 유지).`);
  }
  console.log(`[cfgm-identity] linked: ${goalId} ↔ ${problemId}`);
  return 0;
}

async function cmdList(): Promise<number> {
  const goals = await listGoals();
  if (goals.length === 0) {
    console.log("(등록된 목표 없음)");
    return 0;
  }
  for (const g of goals) {
    const problems = g.relatedProblems.length > 0 ? ` [${g.relatedProblems.join(", ")}]` : "";
    console.log(`- [${g.status}] ${g.title} (${g.id})${problems}`);
  }
  return 0;
}

async function identityBytes(): Promise<number> {
  if (!existsSync(IDENTITY_HOME)) return 0;
  let total = 0;
  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile()) total += (await stat(full)).size;
    }
  }
  await walk(IDENTITY_HOME);
  return total;
}

async function cmdShow(): Promise<number> {
  const bytes = await identityBytes();
  const goals = await listGoals();
  const inProgress = goals.filter((g) => g.status === "in-progress").length;
  console.log(`identity 루트: ${IDENTITY_HOME}`);
  console.log(`총 크기: ${bytes} bytes (${(bytes / 1024).toFixed(1)} KB)`);
  console.log(`goals: ${goals.length}개 (진행 중 ${inProgress}개)`);
  if (bytes > BUDGET_BYTES) {
    console.error(`[cfgm-identity] 경고: identity ${bytes}바이트 — 권장 예산 ${BUDGET_BYTES}바이트 초과. CLAUDE.md 시스템 프롬프트가 비대합니다.`);
  }
  return 0;
}

function usage(): void {
  console.log(`Usage:
  cfgm-identity-goal list
  cfgm-identity-goal add "<title>" <id>
  cfgm-identity-goal done <id>
  cfgm-identity-goal link <goal-id> <problem-id>
  cfgm-identity-goal show
`);
}

async function main(): Promise<number> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "list": return cmdList();
    case "add": {
      const [title, id] = rest;
      if (!title || !id) { usage(); return 2; }
      return cmdAdd(title, id);
    }
    case "done": {
      const [id] = rest;
      if (!id) { usage(); return 2; }
      return cmdDone(id);
    }
    case "link": {
      const [goalId, problemId] = rest;
      if (!goalId || !problemId) { usage(); return 2; }
      return cmdLink(goalId, problemId);
    }
    case "show": return cmdShow();
    default: usage(); return cmd ? 2 : 0;
  }
}

if (import.meta.main) {
  main().then((code) => process.exit(code)).catch((e) => {
    console.error("[cfgm-identity] failed:", e.message);
    process.exit(1);
  });
}
