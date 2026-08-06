import { mkdir, readFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { Glob } from "bun";
import yaml from "yaml";
import type { Redactor } from "../security/Redactor";
import { writeFileAtomic, renameWithRetry } from "../util/atomicWrite";
import { FRONTMATTER_RE, stripBom, normalizeYamlBlock } from "../util/frontmatter";
import { MAX_SLUG_CHARS } from "../util/slug";

/**
 * CaptureAccepter — capture draft → 정식 wiki page 승격의 공용 로직 (V3.42).
 *
 * bin/cfgm-capture-accept.ts 가 얇게 감싸 쓴다. 이전엔 모든 로직이 bin 스크립트에
 * inline 이라 테스트가 0건이었다 — CaptureEnqueuer.ts 와 대칭되는 core 모듈로
 * 분리해 승격 경로도 동일하게 테스트 가능하게 만들었다.
 *
 * type 인자는 이제 선택이다 — draft frontmatter 에 이미 type 이 적혀 있으므로
 * (WIKI-FORMAT.md 필수 필드) 재입력을 요구하지 않고 추론한다. --type 을 같이
 * 주면 frontmatter 값과 일치하는지 검증하는 안전장치로만 쓰인다.
 */

const TYPE_TO_DIR: Record<string, string> = {
  concept: "concepts",
  decision: "decisions",
  project: "projects",
};

export class CaptureAcceptError extends Error {}

export function isSafeSlug(slug: string): boolean {
  if (!slug) return false;
  if (slug.length > MAX_SLUG_CHARS) return false;
  if (slug.includes("/") || slug.includes("\\") || slug.includes("..")) return false;
  return /^[a-zA-Z0-9가-힣_.-]+$/.test(slug);
}

/** draft 본문 frontmatter 의 `type` 필드를 읽는다 — 없거나 파싱 실패면 null. */
export function inferTypeFromDraft(content: string): string | null {
  const match = FRONTMATTER_RE.exec(stripBom(content));
  if (!match) return null;
  try {
    const fm = yaml.parse(normalizeYamlBlock(match[1]!));
    return fm && typeof fm.type === "string" ? fm.type : null;
  } catch {
    return null;
  }
}

export interface AcceptDraftOptions {
  slug: string;
  /** draft 가 들어있는 절대 디렉토리. */
  draftsDir: string;
  /** memory/ 절대 경로 (targetDir = memoryDir/<type>s). */
  memoryDir: string;
  /** 생략 시 draft frontmatter 의 type 을 그대로 쓴다. 지정 시 불일치하면 에러. */
  type?: string;
  force?: boolean;
  /**
   * 승격 직전 draft 본문에서 시크릿을 마스킹한다 (V3.43). host LLM 이 draft 를
   * 작성하는 단계는 우리 코드가 관여하지 않으므로, git 추적 대상인 canonical
   * wiki page 로 넘어가는 이 마지막 관문이 유일하게 통제 가능한 지점이다.
   * 생략하면(테스트 등) 검사하지 않는다 — CLI 는 항상 넘긴다.
   */
  redactor?: Redactor;
}

export interface AcceptDraftResult {
  slug: string;
  type: string;
  draftPath: string;
  targetPath: string;
  supersededExisting: boolean;
  archivePath?: string;
  redacted: boolean;
}

export async function acceptDraft(opts: AcceptDraftOptions): Promise<AcceptDraftResult> {
  const { slug } = opts;
  if (!isSafeSlug(slug)) {
    throw new CaptureAcceptError(`잘못된 slug: ${slug} (경로 구분자/.. 금지)`);
  }

  const draftPath = resolve(opts.draftsDir, `${slug}.md`);
  const draftFile = Bun.file(draftPath);
  if (!(await draftFile.exists())) {
    throw new CaptureAcceptError(`draft 를 찾을 수 없습니다: ${draftPath}`);
  }

  const draftContent = stripBom(await readFile(draftPath, "utf-8"));
  const inferredType = inferTypeFromDraft(draftContent);
  if (opts.type && inferredType && opts.type !== inferredType) {
    throw new CaptureAcceptError(
      `--type ${opts.type} 이 draft frontmatter 의 type: ${inferredType} 과 다릅니다 (${slug})`,
    );
  }
  const type = opts.type ?? inferredType;
  if (!type) {
    throw new CaptureAcceptError(`draft frontmatter 에 type 이 없고 --type 도 지정되지 않았습니다: ${slug}`);
  }

  const targetDirName = TYPE_TO_DIR[type];
  if (!targetDirName) {
    throw new CaptureAcceptError(`알 수 없는 type: ${type} (concept|decision|project 중 하나)`);
  }

  const targetDir = resolve(opts.memoryDir, targetDirName);
  const targetPath = resolve(targetDir, `${slug}.md`);
  const archiveDir = resolve(targetDir, "_archive");

  const targetFile = Bun.file(targetPath);
  const targetExists = await targetFile.exists();
  if (targetExists && !opts.force) {
    throw new CaptureAcceptError(`이미 존재하는 page 입니다: ${targetPath} — --force 로 supersede 하세요.`);
  }

  await mkdir(targetDir, { recursive: true });

  let archivePath: string | undefined;
  if (targetExists && opts.force) {
    await mkdir(archiveDir, { recursive: true });
    archivePath = resolve(archiveDir, `${slug}.md`);
    await renameWithRetry(targetPath, archivePath);
  }

  let content = draftContent.replace(/^status:\s*draft\s*$/m, "status: active");
  let redacted = false;
  if (opts.redactor) {
    const result = await opts.redactor.redact(content);
    content = result.text;
    redacted = result.redacted;
  }
  await writeFileAtomic(targetPath, content);
  try {
    await unlink(draftPath);
  } catch {
    // 삭제 실패해도 승격은 이미 완료 — draft 잔존은 사람이 정리
  }

  return { slug, type, draftPath, targetPath, supersededExisting: targetExists, archivePath, redacted };
}

/** draftsDir 안의 모든 draft slug (확장자 제외, 정렬됨). */
export async function listDraftSlugs(draftsDir: string): Promise<string[]> {
  const glob = new Glob("*.md");
  const slugs: string[] = [];
  try {
    for await (const file of glob.scan({ cwd: draftsDir })) {
      slugs.push(file.replace(/\.md$/, ""));
    }
  } catch {
    return [];
  }
  return slugs.sort();
}

export interface AcceptAllResult {
  accepted: AcceptDraftResult[];
  failed: Array<{ slug: string; reason: string }>;
}

/**
 * draftsDir 안의 모든 draft 를 각자의 frontmatter type 으로 일괄 승격한다.
 * 한 건이 실패해도 나머지는 계속 처리한다 (부분 실패를 failed 목록으로 보고).
 */
export async function acceptAllDrafts(opts: {
  draftsDir: string;
  memoryDir: string;
  force?: boolean;
  redactor?: Redactor;
}): Promise<AcceptAllResult> {
  const slugs = await listDraftSlugs(opts.draftsDir);
  const accepted: AcceptDraftResult[] = [];
  const failed: Array<{ slug: string; reason: string }> = [];
  for (const slug of slugs) {
    try {
      const result = await acceptDraft({
        slug,
        draftsDir: opts.draftsDir,
        memoryDir: opts.memoryDir,
        force: opts.force,
        redactor: opts.redactor,
      });
      accepted.push(result);
    } catch (e) {
      failed.push({ slug, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return { accepted, failed };
}
