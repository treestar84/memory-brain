#!/usr/bin/env bun
/**
 * cfgm uninstall-project — 프로젝트 단위 설치 제거.
 *
 * install-project.ts 가 등록한 것만 정확히 되돌린다. `<project>/.claude/` 와
 * `<project>/.memory-brain/` 바깥은 절대 건드리지 않는다.
 *
 *   기본 (도구만 제거, 데이터 보존):
 *     - <project>/.claude/settings.json 에서 marker(cfgm-os-project) 훅만 제거
 *       (다른 훅·다른 설정 키는 그대로 둠). 뭔가 지워질 때만 수정 전 .bak-<timestamp> 백업.
 *       제거 후 settings.json 이 완전히 빈 객체({})가 되면 파일 자체를 삭제.
 *     - <project>/.claude/commands/*.md 에서 관리 대상(marker) 파일만 제거, 사용자 파일은 보존.
 *     - install manifest 제거.
 *     - <project>/.memory-brain/ (캡처된 메모리 데이터) 는 그대로 보존.
 *
 *   --purge (도구 + 데이터 모두 제거):
 *     - 위 기본 동작에 더해 <project>/.memory-brain/ 전체를 삭제.
 *
 * 사용법:
 *   bun run bin/uninstall-project.ts [--project <path>] [--purge] [--dry-run] [--json]
 */
import { readFile, writeFile, unlink, rm, rmdir, readdir, copyFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { isManagedCommand } from "./install-brain";
import { MARKER, resolveProjectPaths, resolveToolRoot } from "./install-project";

function parseArgs(argv: string[]): { project: string | null; purge: boolean; dryRun: boolean; json: boolean } {
  let project: string | null = null;
  let purge = false;
  let dryRun = false;
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--project" && argv[i + 1]) { project = argv[++i]!; continue; }
    if (argv[i] === "--purge") { purge = true; continue; }
    if (argv[i] === "--dry-run") { dryRun = true; continue; }
    if (argv[i] === "--json") { json = true; continue; }
    if (argv[i] === "--help" || argv[i] === "-h") { printUsage(); process.exit(0); }
  }
  return { project, purge, dryRun, json };
}

function printUsage(): void {
  console.log(`cfgm uninstall-project — 프로젝트 단위 설치 제거

사용법:
  bun run bin/uninstall-project.ts [--project <path>] [--purge] [--dry-run] [--json]

  --project <path>  대상 프로젝트 경로 (기본: 현재 디렉토리)
  --purge           .memory-brain/ 데이터까지 완전 삭제 (기본은 도구만 제거, 데이터 보존)
  --dry-run         실제로 지우지 않고 계획만 출력
  --json            결과를 JSON으로 출력`);
}

async function backupIfNeeded(path: string): Promise<string | null> {
  if (!existsSync(path)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${path}.bak-${stamp}`;
  await copyFile(path, backupPath);
  return backupPath;
}

async function cleanSettings(settingsPath: string, dryRun: boolean): Promise<string[]> {
  const actions: string[] = [];
  if (!existsSync(settingsPath)) return actions;

  let settings: Record<string, any>;
  try {
    settings = JSON.parse(await readFile(settingsPath, "utf-8"));
  } catch {
    actions.push(`skip (invalid JSON — not touched): ${settingsPath}`);
    return actions;
  }

  if (!settings.hooks || typeof settings.hooks !== "object") {
    actions.push(`no hooks section in ${settingsPath} — nothing to remove`);
    return actions;
  }

  for (const [type, value] of Object.entries(settings.hooks)) {
    if (!Array.isArray(value)) {
      actions.push(`skip (hooks.${type} is not an array — not touched): ${settingsPath}`);
      return actions;
    }
  }

  let removedAny = false;
  for (const type of Object.keys(settings.hooks)) {
    const before = settings.hooks[type].length;
    settings.hooks[type] = settings.hooks[type].filter((h: any) => h.matcher !== MARKER);
    if (settings.hooks[type].length !== before) removedAny = true;
    if (settings.hooks[type].length === 0) delete settings.hooks[type];
  }

  if (!removedAny) {
    actions.push(`marker(${MARKER}) not found in ${settingsPath} — nothing to remove`);
    return actions;
  }

  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  const willBeEmpty = Object.keys(settings).length === 0;

  if (dryRun) {
    actions.push(`would ${willBeEmpty ? "delete (becomes empty)" : "update"} ${settingsPath} (remove ${MARKER} hooks)`);
    return actions;
  }

  if (willBeEmpty) {
    // 제거 후 완전히 빈 객체가 된다 = 이 파일의 내용 전부가 우리가 install 때 만든 것이었다는
    // 뜻(다른 설정이 조금이라도 있었다면 willBeEmpty 는 false). 보존할 사용자 콘텐츠가 없으므로
    // 백업 없이 그냥 지운다 — 안 그러면 가장 흔한 "설치 후 바로 제거" 케이스에서조차 매번
    // .bak 파일이 영구히 남아 .claude/ 가 절대 완전히 정리되지 않는 부작용이 생긴다.
    await unlink(settingsPath);
    actions.push(`deleted ${settingsPath} (no settings left after removing ${MARKER})`);
  } else {
    const backupPath = await backupIfNeeded(settingsPath);
    if (backupPath) actions.push(`backup created: ${backupPath}`);
    await writeFile(settingsPath, JSON.stringify(settings, null, 2));
    actions.push(`updated ${settingsPath} (removed ${MARKER} hooks, other settings preserved)`);
  }
  return actions;
}

async function cleanCommands(commandsDir: string, dryRun: boolean): Promise<string[]> {
  const actions: string[] = [];
  if (!existsSync(commandsDir)) return actions;

  const entries = await readdir(commandsDir);
  let removed = 0;
  let kept = 0;
  for (const name of entries) {
    if (!name.endsWith(".md")) continue;
    const p = join(commandsDir, name);
    try {
      const content = await readFile(p, "utf-8");
      if (isManagedCommand(content)) {
        if (!dryRun) await unlink(p);
        removed++;
      } else {
        kept++;
      }
    } catch {
      // unreadable file — leave it alone
    }
  }
  if (removed > 0) actions.push(`${dryRun ? "would remove" : "removed"} ${removed} managed command file(s)`);
  if (kept > 0) actions.push(`preserved ${kept} user command file(s) in ${commandsDir}`);
  if (!dryRun) {
    try { await rmdir(commandsDir); } catch { /* non-empty — fine, leave it */ }
  }
  return actions;
}

async function main(): Promise<void> {
  const { project, purge, dryRun, json } = parseArgs(process.argv.slice(2));
  const toolRoot = resolveToolRoot(import.meta.url);
  const targetProject = resolve(project ?? process.cwd());

  if (!existsSync(targetProject)) {
    console.error(`[uninstall-project] 대상 디렉토리가 존재하지 않음: ${targetProject}`);
    process.exit(1);
  }
  if (!statSync(targetProject).isDirectory()) {
    console.error(`[uninstall-project] 대상이 디렉토리가 아님: ${targetProject}`);
    process.exit(1);
  }

  const paths = resolveProjectPaths(toolRoot, targetProject);
  const actions: string[] = [];

  actions.push(...(await cleanSettings(paths.settingsPath, dryRun)));
  actions.push(...(await cleanCommands(paths.commandsDir, dryRun)));

  if (existsSync(paths.manifestPath)) {
    if (!dryRun) await unlink(paths.manifestPath);
    actions.push(`${dryRun ? "would remove" : "removed"} ${paths.manifestPath}`);
  }

  if (!dryRun && existsSync(paths.claudeDir)) {
    try {
      await rmdir(paths.claudeDir);
      actions.push(`removed empty ${paths.claudeDir}`);
    } catch {
      // non-empty (user has other .claude/ content) — leave it alone
    }
  }

  if (purge) {
    if (existsSync(paths.memoryDir) && !statSync(paths.memoryDir).isDirectory()) {
      // 실제로 재현된 사고: .memory-brain 이라는 이름의, 우리와 무관한 사용자 파일이 있으면
      // --purge 가 그걸 그대로 지워버렸다. 디렉토리가 아니면 절대 건드리지 않는다.
      actions.push(`refused to purge ${paths.memoryDir} — exists but is not a directory (looks unrelated to memory-brain; not touched)`);
    } else if (existsSync(paths.memoryDir)) {
      if (!dryRun) await rm(paths.memoryDir, { recursive: true, force: true });
      actions.push(`${dryRun ? "would delete" : "deleted"} ${paths.memoryDir} (data — purge)`);
    } else {
      actions.push(`no ${paths.memoryDir} to purge`);
    }
  } else if (existsSync(paths.memoryDir)) {
    actions.push(`preserved ${paths.memoryDir} (data — use --purge to remove)`);
  }

  if (json) {
    console.log(JSON.stringify({ dryRun, purge, targetProject, actions }, null, 2));
  } else {
    console.log(`[uninstall-project] ${dryRun ? "(dry-run) " : ""}대상: ${targetProject}`);
    for (const a of actions) console.log(`  - ${a}`);
  }
}

if (import.meta.main) {
  main().catch((e) => { console.error("[uninstall-project] failed:", e.message); process.exit(1); });
}
