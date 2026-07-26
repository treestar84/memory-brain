import yaml from "yaml";
import type { WikiPage, WikiType } from "../wiki/types";

/**
 * OKF (Open Knowledge Format) 번들 exporter (V3.28).
 *
 * Google Cloud OKF v0.1 (2026-06-12 공개, GoogleCloudPlatform/knowledge-catalog)
 * 호환 번들을 wiki layer 에서 생성한다. OKF 는 "markdown 디렉토리 + YAML
 * frontmatter, 필수 필드는 type 하나" 인 vendor-neutral 스펙 — memory-brain
 * L3 wiki 는 이미 같은 패턴이므로 본 모듈은 필드 정렬 + 번들 구조만 담당한다.
 *
 * 방향성 결정 (2026-07-21 사용자 합의): OKF 는 코어 재구조화 대상이 아니라
 * **어댑터 경계 뒤의 호환 레이어**다. wiki 스키마가 truth, OKF 는 파생 export.
 */

export interface OkfFile {
  /** 번들 루트 기준 상대 경로 */
  relPath: string;
  content: string;
}

export interface OkfExportOptions {
  /** 번들 root index.md 의 제목 */
  bundleTitle?: string;
  /** true(기본): 모든 status 포함. false: active/draft 만. */
  includeAllStatuses?: boolean;
}

// "note" (V3.41, frontmatter 없는 원문) 은 cfgm-okf-export 의 canonical 3-dir
// 스캔에 절대 포함되지 않는다 — 여기 있는 건 Record<WikiType,...> 타입 완전성
// 때문. 실제로 note 페이지가 이 함수에 들어오면 캐치되지 않은 상위 버그다.
const TYPE_DIRS: Record<WikiType, string> = {
  project: "projects",
  concept: "concepts",
  decision: "decisions",
  note: "notes",
};

const WIKILINK_RE = /\[\[([\w.-]+)\]\]/g;

/** wiki page 1개 → OKF concept 문서 1개. */
export function toOkfDocument(page: WikiPage, knownIds: ReadonlySet<string>): OkfFile {
  const fm = page.frontmatter;
  const dir = TYPE_DIRS[fm.type];
  const slug = slugOf(fm.id);
  const title = extractTitle(page.body) ?? fm.id;
  const description = extractDescription(page.body);

  // OKF v0.1: type 만 필수, 나머지 표준 선택 필드 + producer 확장 필드 자유.
  // x_cfgm_* 는 memory-brain provenance — OKF consumer 는 무시해도 무방.
  const okfFm: Record<string, unknown> = { type: fm.type, title };
  if (description) okfFm.description = description;
  okfFm.resource = `memory/${page.path}`;
  if (fm.tags && fm.tags.length > 0) okfFm.tags = fm.tags;
  okfFm.timestamp = fm.updated_at;
  okfFm.x_cfgm_id = fm.id;
  okfFm.x_cfgm_status = fm.status;
  if (fm.confidence) okfFm.x_cfgm_confidence = fm.confidence;
  if (fm.supersedes && fm.supersedes.length > 0) okfFm.x_cfgm_supersedes = fm.supersedes;

  const body = rewriteWikiLinks(page.body, fm.type, knownIds).trim();
  const content = `---\n${yaml.stringify(okfFm).trimEnd()}\n---\n\n${body}\n`;
  return { relPath: `${dir}/${slug}.md`, content };
}

/** wiki pages → OKF 번들 파일 목록 (concept 문서 + dir index + root index). */
export function buildOkfBundle(pages: WikiPage[], opts: OkfExportOptions = {}): OkfFile[] {
  const includeAll = opts.includeAllStatuses ?? true;
  const selected = includeAll
    ? pages
    : pages.filter((p) => p.frontmatter.status === "active" || p.frontmatter.status === "draft");

  const knownIds = new Set(selected.map((p) => p.frontmatter.id));
  const files: OkfFile[] = [];
  const byDir = new Map<string, Array<{ page: WikiPage; file: OkfFile }>>();

  for (const page of sortPages(selected)) {
    const file = toOkfDocument(page, knownIds);
    files.push(file);
    const dir = file.relPath.split("/")[0]!;
    const entry = { page, file };
    const list = byDir.get(dir);
    if (list) list.push(entry);
    else byDir.set(dir, [entry]);
  }

  for (const [dir, entries] of byDir) {
    const lines = entries.map(({ page, file }) => {
      const name = file.relPath.split("/")[1]!;
      const title = extractTitle(page.body) ?? page.frontmatter.id;
      const desc = extractDescription(page.body);
      return `- [${title}](${name})${desc ? ` — ${desc}` : ""}`;
    });
    files.push({
      relPath: `${dir}/index.md`,
      content: `---\ntype: Index\ntitle: ${dir}\n---\n\n# ${dir}\n\n${lines.join("\n")}\n`,
    });
  }

  const rootLines = Array.from(byDir.keys())
    .sort()
    .map((dir) => `- [${dir}](${dir}/index.md) — ${byDir.get(dir)!.length} concepts`);
  const bundleTitle = opts.bundleTitle ?? "memory-brain OKF bundle";
  files.push({
    relPath: "index.md",
    content: `---\ntype: Index\ntitle: ${bundleTitle}\n---\n\n# ${bundleTitle}\n\nExported from memory-brain L3 wiki (canonical knowledge layer).\n\n${rootLines.join("\n")}\n`,
  });

  return files;
}

// wiki frontmatter id 는 외부 입력일 수 있다 — 파일명으로 쓰이므로 path
// traversal 방어: 경로 구분자·상위 참조를 무해한 문자로 치환, 선행 dot 제거.
function slugOf(id: string): string {
  const dot = id.indexOf(".");
  const raw = dot >= 0 ? id.slice(dot + 1) : id;
  const safe = raw.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/\.\.+/g, ".").replace(/^\.+/, "");
  return safe.length > 0 ? safe : "unnamed";
}

/**
 * `[[type.slug]]` cross-link → OKF 상대 markdown link.
 * export 집합에 없는 id 는 링크 파괴 대신 plain text 로 남긴다.
 */
function rewriteWikiLinks(body: string, fromType: WikiType, knownIds: ReadonlySet<string>): string {
  return body.replace(WIKILINK_RE, (whole, id: string) => {
    if (!knownIds.has(id)) return whole;
    const targetType = id.split(".")[0] as WikiType;
    const dir = TYPE_DIRS[targetType];
    if (!dir) return whole;
    const rel = TYPE_DIRS[fromType] === dir ? `${slugOf(id)}.md` : `../${dir}/${slugOf(id)}.md`;
    return `[${id}](${rel})`;
  });
}

function extractTitle(body: string): string | null {
  const m = /^#\s+(.+)$/m.exec(body);
  return m ? m[1]!.trim() : null;
}

/**
 * OKF description — `## Summary` 첫 진술 우선, 없으면 첫 본문 문단 첫 줄.
 * claim HTML 주석은 제거.
 */
function extractDescription(body: string): string | null {
  const cleaned = body.replace(/<!--[\s\S]*?-->/g, "");
  const lines = cleaned.split("\n");
  const summaryIdx = lines.findIndex((l) => /^##\s+summary\b/i.test(l.trim()));
  const scan = summaryIdx >= 0 ? lines.slice(summaryIdx + 1) : lines;
  for (const line of scan) {
    const t = line.trim();
    if (t.length === 0) continue;
    if (t.startsWith("#")) {
      if (summaryIdx >= 0) break; // Summary 섹션 끝
      continue;
    }
    if (t.startsWith(">") || t.startsWith("|") || t.startsWith("```")) continue;
    return t.replace(/^[-*]\s+/, "").slice(0, 200);
  }
  return null;
}

function sortPages(pages: WikiPage[]): WikiPage[] {
  return [...pages].sort((a, b) => a.frontmatter.id.localeCompare(b.frontmatter.id));
}
