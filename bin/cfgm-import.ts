#!/usr/bin/env bun
import { resolve, join } from "node:path";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { Glob } from "bun";
import { resolveRepoRoot, resolveStorageRoot } from "../src/hooks/bootstrap";
import { parseClaudeCodeTranscript, renderClaudeCodeSessionMarkdown } from "../src/core/import/ClaudeCodeImporter";
import { Redactor } from "../src/core/security/Redactor";
import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { enqueueSource, sha256, slugFromPath } from "../src/core/capture/CaptureEnqueuer";

/**
 * cfgm-import — 멀티소스 임포트, 1호: Claude Code 자체 세션 transcript.
 *
 * `~/.claude/projects/<sanitized-cwd>/<uuid>.jsonl` (또는 그런 파일이 든 디렉토리) 를
 * 읽어 사람이 읽을 수 있는 markdown 세션 노트로 변환해 `memory/sources/sessions/claude-code/`
 * 에 적재한다. 대화를 직접 claim 으로 만들지 않는다 — docs/RULES.md 원칙 2(LLM API
 * 호출 금지) 와 CLAUDE.md 의 "inference 를 fact 로 저장 금지" 를 지키기 위해, 의미
 * 추출은 이미 있는 capture 파이프라인(host LLM 위임)에 --enqueue 로 넘긴다.
 *
 * 사용법:
 *   bun run bin/cfgm-import.ts --input <transcript.jsonl>
 *   bun run bin/cfgm-import.ts --input ~/.claude/projects/<project-dir>/
 *   bun run bin/cfgm-import.ts --input <경로> --dry-run
 *   bun run bin/cfgm-import.ts --input <경로> --enqueue --limit 5
 *   bun run bin/cfgm-import.ts --input <경로> --force   # 이미 임포트된 sha256 도 재기록
 *
 * 멱등성: memory/sources/_manifest.jsonl 에 {sha256, path, importedAt, ...} 를
 * append-only 로 기록. 같은 (redaction 이후) 내용의 sha256 이 이미 있으면 skip.
 */

interface ParsedArgs {
  input: string | null;
  dryRun: boolean;
  json: boolean;
  force: boolean;
  enqueue: boolean;
  limit: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { input: null, dryRun: false, json: false, force: false, enqueue: false, limit: Infinity };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input" && argv[i + 1]) { args.input = argv[++i]!; continue; }
    if (argv[i] === "--dry-run") { args.dryRun = true; continue; }
    if (argv[i] === "--json") { args.json = true; continue; }
    if (argv[i] === "--force") { args.force = true; continue; }
    if (argv[i] === "--enqueue") { args.enqueue = true; continue; }
    if (argv[i] === "--limit" && argv[i + 1]) { args.limit = Number.parseInt(argv[++i]!, 10); continue; }
    if (argv[i] === "--help" || argv[i] === "-h") { printUsage(); process.exit(0); }
  }
  return args;
}

function printUsage(): void {
  console.log(`cfgm import — Claude Code 세션 transcript 임포트

사용법:
  bun run bin/cfgm-import.ts --input <파일|디렉토리> [--dry-run] [--json] [--force] [--enqueue [--limit N]]

  --input <경로>  .jsonl transcript 파일 하나 또는 그런 파일이 든 디렉토리(재귀)
  --dry-run       실제로 쓰지 않고 계획만 출력
  --json          결과를 JSON으로 출력
  --force         이미 임포트된(sha256 일치) 항목도 다시 기록
  --enqueue       변환된 세션 노트를 capture 큐에도 등록 (--limit 로 건수 제한 권장)
  --limit N       --enqueue 시 큐에 올릴 최대 건수 (기본 무제한 — 대량 임포트 시 반드시 지정할 것)`);
}

async function findTranscriptFiles(inputPath: string): Promise<string[]> {
  const st = await stat(inputPath);
  if (st.isFile()) return [inputPath];
  const glob = new Glob("**/*.jsonl");
  const files: string[] = [];
  for await (const rel of glob.scan({ cwd: inputPath })) {
    files.push(join(inputPath, rel));
  }
  return files.sort();
}

interface ManifestEntry {
  sourceFile: string;
  sessionId: string | null;
  sha256: string;
  path: string;
  importedAt: string;
  turnCount: number;
  redacted: boolean;
  /** 이 sha256 에 대해 capture 큐 enqueue 를 이미 시도했는지 — --limit 로 이번 실행에
   * 못 올린 항목을 다음 `--enqueue` 재실행에서 sha256 재기록 없이 이어서 처리하기 위함. */
  enqueued: boolean;
}

/**
 * append-only manifest 를 sha256 기준 last-wins 로 reduce — `importedAt` 기준
 * (ClaimStore.list() 의 recordedAt 과 동일 원칙, 파일 등장 순서가 아님).
 * `memory/**\/*.jsonl merge=union` 대상이라(docs/SYNC.md) git 동기화 후 줄 순서가
 * 뒤섞일 수 있는데, 파일 순서로 reduce 하면 오래된 엔트리가 방금 enqueue 된
 * 최신 엔트리를 덮어써 `enqueued` 상태가 잘못 되돌아갈 수 있다 — 모든
 * ManifestEntry 는 `importedAt` 이 항상 있으므로(ClaimStore.recordedAt 과 달리
 * optional 이 아님) 폴백 분기 없이 바로 비교 가능하다.
 */
async function readManifestReduced(manifestPath: string): Promise<Map<string, ManifestEntry>> {
  const bySha = new Map<string, ManifestEntry>();
  if (!existsSync(manifestPath)) return bySha;
  const text = await readFile(manifestPath, "utf-8");
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry: ManifestEntry = JSON.parse(line);
      const existing = bySha.get(entry.sha256);
      if (!existing || entry.importedAt >= existing.importedAt) bySha.set(entry.sha256, entry);
    } catch {
      // 손상된 줄 — jsonl.ts 의 lenient 파싱과 동일 원칙, 건너뛴다
    }
  }
  return bySha;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    printUsage();
    process.exit(1);
  }

  const inputPath = resolve(args.input);
  if (!existsSync(inputPath)) {
    console.error(`[cfgm-import] 대상이 존재하지 않음: ${inputPath}`);
    process.exit(1);
  }

  const repoRoot = resolveRepoRoot();
  const sourcesDir = join(repoRoot, "memory", "sources", "sessions", "claude-code");
  const manifestPath = join(repoRoot, "memory", "sources", "_manifest.jsonl");
  const jobsDir = join(repoRoot, "memory", "_pending", "capture", "jobs");
  const draftsDir = join(repoRoot, "memory", "_pending", "capture", "drafts");
  const specDir = join(repoRoot, "memory", "_pending", "capture", "_spec");

  const redactor = new Redactor(new FsStorage(resolveStorageRoot()), new RealClock());
  const bySha = await readManifestReduced(manifestPath);

  const files = await findTranscriptFiles(inputPath);
  const actions: string[] = [];
  const newManifestEntries: ManifestEntry[] = [];
  let enqueuedCount = 0;
  let limitReached = false;

  for (const file of files) {
    const raw = await readFile(file, "utf-8");
    const session = parseClaudeCodeTranscript(raw);
    if (session.turns.length === 0) {
      actions.push(`skip (no user/assistant text turns): ${file}`);
      continue;
    }

    const rendered = renderClaudeCodeSessionMarkdown(session, file);
    const { text: redactedText, redacted } = await redactor.redact(rendered);
    const sha = await sha256(redactedText);
    const existing = bySha.get(sha);

    if (existing && !args.force) {
      // 이미 sources/ 에 적재된 내용 — 다시 쓰지 않는다. 다만 지난 실행이
      // --limit 때문에 이 항목의 enqueue 를 못 했다면, 여기서 이어서 시도한다
      // (sha256 은 안 바뀌었으니 다시 임포트할 필요는 없음).
      if (args.enqueue && !existing.enqueued && enqueuedCount < args.limit && !args.dryRun) {
        const result = await enqueueSource({
          sourcePath: existing.path,
          sourceText: redactedText,
          jobsDir,
          draftsDir,
          specDir,
          extraNote: `Claude Code 세션 임포트 (원본: ${file})`,
        });
        if (result.enqueued) {
          enqueuedCount++;
          actions.push(`enqueued (resumed) ${result.jobPath}`);
          newManifestEntries.push({ ...existing, enqueued: true });
        } else if (result.skipped) {
          actions.push(`skip enqueue (job already exists, unchanged): ${existing.path}`);
        }
      } else {
        actions.push(`skip (already imported, sha256 unchanged): ${file}`);
        if (args.enqueue && !existing.enqueued) limitReached = true;
      }
      continue;
    }

    const monthPrefix = (session.firstTimestamp ?? (await stat(file)).mtime.toISOString()).slice(0, 7);
    const slug = `${slugFromPath(file)}--${sha.slice(0, 8)}`;
    const targetDir = join(sourcesDir, monthPrefix);
    const targetPath = join(targetDir, `${slug}.md`);

    if (args.dryRun) {
      actions.push(`would write ${targetPath}${redacted ? " (redacted)" : ""}`);
      continue;
    }

    await mkdir(targetDir, { recursive: true });
    await writeFile(targetPath, redactedText);
    actions.push(`wrote ${targetPath}${redacted ? " (redacted)" : ""}`);

    let didEnqueue = false;
    if (args.enqueue && enqueuedCount < args.limit) {
      const result = await enqueueSource({
        sourcePath: targetPath,
        sourceText: redactedText,
        jobsDir,
        draftsDir,
        specDir,
        extraNote: `Claude Code 세션 임포트 (원본: ${file})`,
      });
      if (result.enqueued) {
        enqueuedCount++;
        didEnqueue = true;
        actions.push(`enqueued ${result.jobPath}`);
      } else if (result.skipped) {
        actions.push(`skip enqueue (job already exists, unchanged): ${targetPath}`);
      }
    } else if (args.enqueue) {
      limitReached = true;
    }

    const entry: ManifestEntry = {
      sourceFile: file,
      sessionId: session.sessionId,
      sha256: sha,
      path: targetPath,
      importedAt: new Date().toISOString(),
      turnCount: session.turns.length,
      redacted,
      enqueued: didEnqueue,
    };
    newManifestEntries.push(entry);
    bySha.set(sha, entry);
  }

  if (!args.dryRun && newManifestEntries.length > 0) {
    await mkdir(join(repoRoot, "memory", "sources"), { recursive: true });
    const lines = newManifestEntries.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await writeFile(manifestPath, lines, { flag: "a" });
  }

  if (limitReached) {
    actions.push(`--limit ${args.limit} 도달 — 아직 enqueue 안 된 항목 있음. cfgm import 를 --input 그대로 + --enqueue 로 다시 실행하면 (재임포트 없이) enqueue 만 이어서 처리됨`);
  }

  if (args.json) {
    console.log(JSON.stringify({ dryRun: args.dryRun, inputPath, filesScanned: files.length, enqueuedCount, actions }, null, 2));
  } else {
    console.log(`[cfgm-import] ${args.dryRun ? "(dry-run) " : ""}대상: ${inputPath} (${files.length}개 transcript 스캔)`);
    for (const a of actions) console.log(`  - ${a}`);
  }
}

main().catch((e) => {
  console.error("[cfgm-import] failed:", e.message);
  process.exit(1);
});
