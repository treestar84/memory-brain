#!/usr/bin/env bun
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { resolveStorageRoot, buildClaimStorage, resolveRepoRoot } from "../src/hooks/bootstrap";
import { acceptDraft, acceptAllDrafts, listDraftSlugs, CaptureAcceptError } from "../src/core/capture/CaptureAccepter";
import { WikiReader } from "../src/core/wiki/WikiReader";
import { ClaimStore } from "../src/core/claim/ClaimStore";
import { SearchIndex } from "../src/core/search/SearchIndex";
import { HashedNgramEmbedder } from "../src/core/search/Embedder";
import { Indexer } from "../src/core/search/Indexer";
import { SSLReader } from "../src/core/search/SSLReader";
import { RealClock } from "../src/core/clock/Clock";
import { Redactor } from "../src/core/security/Redactor";
import { FsStorage } from "../src/core/storage/FsStorage";
import { AutoTrigger } from "../src/core/auto-trigger/AutoTrigger";

/**
 * cfgm-capture-accept — capture draft 를 정식 wiki page 로 승격.
 *
 * 사용법:
 *   bun run bin/cfgm-capture-accept.ts <slug> [--type concept|decision|project] [--force]
 *   bun run bin/cfgm-capture-accept.ts --all [--force]              # 큐의 draft 전부 일괄 승격
 *   bun run bin/cfgm-capture-accept.ts <slug|--all> --drafts-dir <경로>
 *   bun run bin/cfgm-capture-accept.ts <slug|--all> --reindex [--no-embeddings]  # 승격 후 인덱스 자동 재생성(기본 하이브리드)
 *
 * type 은 draft frontmatter 에서 자동 추론된다(WIKI-FORMAT.md 필수 필드) — --type 은
 * 일치 검증용 옵션일 뿐 필수 아니다(V3.42). --all 은 draft 마다 서로 다른 type 이어도
 * 한 번에 처리한다.
 *
 * draft 탐색: repo 큐 (memory/_pending/capture/drafts) 우선, 없으면 storage 큐
 * (<storageRoot>/_pending/capture/drafts) 도 탐색한다. --all 은 repo 큐를 기본으로
 * 쓰고, storage 큐에도 draft 가 있으면 안내만 출력한다(자동 병합하지 않음 — 두 큐를
 * 섞어 처리하면 어느 큐에서 왔는지 추적이 어려워진다).
 */

function parseArgs(argv: string[]): {
  slug: string | null;
  all: boolean;
  type: string | null;
  force: boolean;
  json: boolean;
  reindex: boolean;
  noEmbeddings: boolean;
  draftsDir: string | null;
} {
  let type: string | null = null;
  let force = false;
  let json = false;
  let all = false;
  let reindex = false;
  let noEmbeddings = false;
  let draftsDir: string | null = null;
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--type" && argv[i + 1]) { type = argv[++i]!; continue; }
    if (a === "--force") { force = true; continue; }
    if (a === "--json") { json = true; continue; }
    if (a === "--all") { all = true; continue; }
    if (a === "--reindex") { reindex = true; continue; }
    if (a === "--no-embeddings") { noEmbeddings = true; continue; }
    if (a === "--embeddings") { continue; } // 기본값이 됐다(V3.43) — 하위호환을 위해 no-op 로 허용
    if (a === "--drafts-dir" && argv[i + 1]) { draftsDir = argv[++i]!; continue; }
    positional.push(a!);
  }
  return { slug: positional[0] ?? null, all, type, force, json, reindex, noEmbeddings, draftsDir };
}

const USAGE =
  "사용법: cfgm capture-accept <slug> [--type concept|decision|project] [--force] | cfgm capture-accept --all [--force]";

const rawArgv = process.argv.slice(2);
if (rawArgv.includes("--help") || rawArgv.includes("-h")) {
  console.log(USAGE);
  process.exit(0);
}

const repoRoot = resolveRepoRoot();
const memoryDir = resolve(repoRoot, "memory");
const { slug, all, type, force, json, reindex, noEmbeddings, draftsDir: draftsDirArg } = parseArgs(rawArgv);

if (!slug && !all) {
  console.error(USAGE);
  process.exit(2);
}

const repoDraftsDir = resolve(repoRoot, "memory/_pending/capture/drafts");
const storageDraftsDir = resolve(resolveStorageRoot(), "_pending/capture/drafts");

/**
 * host LLM 이 draft 를 작성하는 단계는 우리 코드가 못 보므로, git 추적 canonical
 * wiki page 로 넘어가기 직전인 이 승격 시점이 시크릿 유출을 막을 유일한 관문이다
 * (V3.43 — 이전엔 이 파이프라인에 redaction 이 전혀 연결돼 있지 않았다).
 */
const redactor = new Redactor(new FsStorage(resolveStorageRoot()), new RealClock());

async function runReindex(): Promise<void> {
  const storageRoot = resolveStorageRoot();
  const indexDir = resolve(storageRoot, "indexes");
  await mkdir(indexDir, { recursive: true });
  const indexPath = resolve(indexDir, "search.sqlite");

  const wikiReader = new WikiReader(memoryDir);
  const sslReader = new SSLReader(memoryDir);
  const clock = new RealClock();
  const claimStore = new ClaimStore(buildClaimStorage(), clock);
  const searchIndex = new SearchIndex(indexPath);
  const embedder = noEmbeddings ? undefined : new HashedNgramEmbedder();
  const indexer = new Indexer(wikiReader, claimStore, searchIndex, sslReader, embedder);
  const result = await indexer.rebuild();
  searchIndex.close();

  // cfgm rebuild-index 와 동일하게 기록 — 안 하면 session-start 의 "24h 미실행"
  // 넛지가 방금 재생성했는데도 계속 뜬다(V3.43, 배선 매트릭스 파일럿에서 발견).
  const autoTrigger = new AutoTrigger(new FsStorage(storageRoot), clock);
  await autoTrigger.markRun("search-index");
  console.log(`  → 인덱스 재생성 완료: wiki ${result.wikiCount}건 (${result.durationMs}ms)`);
}

if (all) {
  let draftsDir = draftsDirArg ? resolve(repoRoot, draftsDirArg) : repoDraftsDir;

  const { accepted, failed } = await acceptAllDrafts({ draftsDir, memoryDir, force, redactor });

  if (!draftsDirArg) {
    const storageIsDistinct = resolve(storageDraftsDir) !== resolve(repoDraftsDir);
    if (storageIsDistinct) {
      const storageSlugs = await listDraftSlugs(storageDraftsDir);
      if (storageSlugs.length > 0 && !json) {
        console.log(
          `\n참고: storage 큐(${storageDraftsDir})에도 draft ${storageSlugs.length}건이 더 있습니다 — ` +
            `처리하려면 --drafts-dir "${storageDraftsDir}" --all 로 재실행하세요.`,
        );
      }
    }
  }

  if (json) {
    console.log(JSON.stringify({ draftsDir, accepted, failed }, null, 2));
  } else {
    console.log(`일괄 승격 — 성공 ${accepted.length}건 / 실패 ${failed.length}건`);
    for (const r of accepted) {
      console.log(`  ✓ ${r.slug} (${r.type}) → ${r.targetPath}`);
      if (r.redacted) console.log(`    ⚠ 시크릿 패턴 감지 — 마스킹 후 저장됨 (security/redacted.jsonl 참조)`);
    }
    for (const f of failed) console.log(`  ✗ ${f.slug}: ${f.reason}`);
  }

  if (reindex && accepted.length > 0) await runReindex();
  else if (accepted.length > 0 && !json) console.log(`\n→ cfgm rebuild-index 재실행 필요 (검색 인덱스 갱신).`);

  process.exit(failed.length > 0 ? 1 : 0);
}

// 단일 slug 모드
let draftsDir: string;
if (draftsDirArg) {
  draftsDir = resolve(repoRoot, draftsDirArg);
} else {
  const repoCandidate = resolve(repoDraftsDir, `${slug}.md`);
  const storageCandidate = resolve(storageDraftsDir, `${slug}.md`);
  const repoExists = await Bun.file(repoCandidate).exists();
  const storageIsDistinct = resolve(storageDraftsDir) !== resolve(repoDraftsDir);
  const storageExists = storageIsDistinct && (await Bun.file(storageCandidate).exists());

  if (repoExists && storageExists) {
    console.error(
      `draft "${slug}" 가 repo 큐(${repoDraftsDir})와 storage 큐(${storageDraftsDir}) 양쪽에 존재합니다 — --drafts-dir 로 위치를 명시하세요.`,
    );
    process.exit(1);
  }
  if (!repoExists && !storageExists) {
    console.error(
      `draft "${slug}" 를 다음 두 위치 어디에서도 찾을 수 없습니다:\n  - repo 큐: ${repoCandidate}\n  - storage 큐: ${storageCandidate}`,
    );
    process.exit(1);
  }
  draftsDir = repoExists ? repoDraftsDir : storageDraftsDir;
}

try {
  const result = await acceptDraft({ slug: slug!, draftsDir, memoryDir, type: type ?? undefined, force, redactor });
  if (json) {
    console.log(
      JSON.stringify(
        {
          slug: result.slug,
          type: result.type,
          draftsDir,
          targetPath: result.targetPath,
          supersededExisting: result.supersededExisting,
          redacted: result.redacted,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`승격 완료: ${result.draftPath} → ${result.targetPath}`);
    if (result.archivePath) console.log(`기존 page 는 ${result.archivePath} 로 보관되었습니다.`);
    if (result.redacted) console.log(`⚠ 시크릿 패턴 감지 — 마스킹 후 저장됨 (security/redacted.jsonl 참조)`);
  }
  if (reindex) await runReindex();
  else if (!json) console.log(`\n→ cfgm rebuild-index 재실행 필요 (검색 인덱스 갱신).`);
} catch (e) {
  if (e instanceof CaptureAcceptError) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}
