import { Glob } from "bun";
import { resolve } from "node:path";
import yaml from "yaml";
import type { WikiPage, WikiPageFrontmatter } from "./types";

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
const CLAIM_ID_RE = /<!--\s*claim:(cl-[\w-]+)\s*-->/g;

/** Indexer.rebuild() 가 wiki_pages 인덱스에 넣는 canonical 서브디렉토리 집합. */
export const CANONICAL_WIKI_SUBDIRS = ["projects", "concepts", "decisions"] as const;

/**
 * Wiki Layer 1차 reader (PR-V3.4).
 *
 * memory/{projects,concepts,decisions}/star.md 의 frontmatter + claim id +
 * evidence 추출. Bun.file 직접 사용 (Storage interface 우회 - git 트래킹된
 * memory/ 디렉토리는 .memory-brain storage root 와 별도).
 *
 * 후속 PR-V3.5 에서 ClaimStore 와 cross-reference, PR-V3.6 에서 sqlite 인덱스.
 *
 * frontmatter 없는 원문 markdown 은 `type: "note"` 로 합성해 반환한다 (V3.41) —
 * canonical page 취급은 아니지만 body 전체가 검색 대상이 된다.
 */
export class WikiReader {
  constructor(private readonly memoryDir: string = resolve(process.cwd(), "memory")) {}

  async read(relativePath: string): Promise<WikiPage | null> {
    const fullPath = resolve(this.memoryDir, relativePath);
    const file = Bun.file(fullPath);
    if (!(await file.exists())) return null;
    const text = await file.text();
    const stat = await file.stat();
    return this.parse(relativePath, text, stat.mtime.toISOString());
  }

  /**
   * frontmatter 없는 원문(운영 일지, 벤치마크 리포트 등)은 `type: "note"` 로
   * 합성해 반환한다 — canonical wiki page 는 아니지만 검색(FTS)에서는 찾을 수
   * 있어야 한다 (V3.41, "claim 마커 없는 실사용 기록이 검색에서 통째로 빠지는"
   * 구조적 결함 수정). `fallbackUpdatedAt` 은 `read()` 가 파일 mtime 으로 채운다
   * — 없으면(직접 parse 호출) "unknown".
   */
  parse(relativePath: string, text: string, fallbackUpdatedAt?: string): WikiPage | null {
    const match = FRONTMATTER_RE.exec(text);
    if (!match) return this.parseNote(relativePath, text, fallbackUpdatedAt);
    const fmYaml = match[1]!;
    const body = match[2]!;

    let frontmatter: WikiPageFrontmatter;
    try {
      const parsed = yaml.parse(fmYaml);
      if (!parsed || typeof parsed !== "object") return null;
      frontmatter = parsed as WikiPageFrontmatter;
    } catch {
      return null;
    }

    if (typeof frontmatter.id !== "string" || frontmatter.id.length === 0) return null;
    if (typeof frontmatter.type !== "string") return null;
    if (typeof frontmatter.status !== "string") return null;
    if (typeof frontmatter.updated_at !== "string") return null;

    const claimIds = this.extractClaimIds(body);
    const evidence = this.extractEvidence(body);

    return { path: relativePath, frontmatter, body, claimIds, evidence };
  }

  private parseNote(relativePath: string, text: string, fallbackUpdatedAt?: string): WikiPage | null {
    if (text.trim().length === 0) return null;
    const id = `note.${relativePath.replace(/\.md$/, "").replace(/\//g, ".")}`;
    const frontmatter: WikiPageFrontmatter = {
      id,
      type: "note",
      status: "draft",
      updated_at: fallbackUpdatedAt ?? "unknown",
    };
    return {
      path: relativePath,
      frontmatter,
      body: text,
      claimIds: this.extractClaimIds(text),
      evidence: this.extractEvidence(text),
    };
  }

  async readAllInDir(subdir: string): Promise<WikiPage[]> {
    const glob = new Glob(`${subdir}/**/*.md`);
    const pages: WikiPage[] = [];
    for await (const file of glob.scan({ cwd: this.memoryDir })) {
      if (file.endsWith("README.md")) continue;
      const p = await this.read(file);
      if (p) pages.push(p);
    }
    return pages;
  }

  /**
   * canonical wiki page 전체 나열(projects/concepts/decisions, `_` 프리픽스
   * 서브디렉토리 제외 — Indexer.rebuild() 가 wiki_pages 인덱스에 넣는 것과
   * 동일한 집합). 대시보드/뷰어처럼 "지금 인덱스에 뭐가 있는지" 를 그대로
   * 보여줘야 하는 곳에서 쓴다.
   */
  async listCanonicalPages(): Promise<WikiPage[]> {
    const pages: WikiPage[] = [];
    for (const dir of CANONICAL_WIKI_SUBDIRS) {
      const dirPages = await this.readAllInDir(dir);
      for (const p of dirPages) {
        if (p.path.split("/").some((seg) => seg.startsWith("_"))) continue;
        pages.push(p);
      }
    }
    return pages;
  }

  /**
   * note 파일 1개를 `## ` 헤딩 단위로 쪼개 여러 WikiPage 로 반환한다 (V3.41).
   *
   * `current.md`/`journal/*.md` 처럼 여러 주제(버전별 작업 기록)가 한 파일에
   * 이어붙어 있으면, 파일 전체를 하나의 FTS 문서로 넣었을 때 BM25 랭킹과
   * snippet 추출이 무관한 구간을 고르는 문제가 있었다 — "SessionConsolidator를
   * 왜 폐기했지" 질문이 상위 문서 순위와 snippet 모두를 놓친 실측 사례로 확인됨.
   * 헤딩 단위로 쪼개면 각 chunk 가 단일 주제만 담아 정확도가 올라간다.
   *
   * frontmatter 가 있는 정식 wiki page 는 대상이 아니다(그대로 단일 파싱).
   * `##` 헤딩이 없으면(짧은 note 등) 쪼갤 이유가 없으니 1개 페이지로 유지한다.
   */
  async readNoteChunks(relativePath: string): Promise<WikiPage[]> {
    const fullPath = resolve(this.memoryDir, relativePath);
    const file = Bun.file(fullPath);
    if (!(await file.exists())) return [];
    const text = await file.text();
    const stat = await file.stat();
    const updatedAt = stat.mtime.toISOString();

    if (FRONTMATTER_RE.test(text)) {
      const page = this.parse(relativePath, text, updatedAt);
      return page ? [page] : [];
    }

    const sections = this.splitByH2(text);
    if (sections.length <= 1) {
      const page = this.parseNote(relativePath, text, updatedAt);
      return page ? [page] : [];
    }

    const baseId = `note.${relativePath.replace(/\.md$/, "").replace(/\//g, ".")}`;
    const pages: WikiPage[] = [];
    sections.forEach((section, i) => {
      if (section.trim().length === 0) return;
      pages.push({
        path: relativePath,
        frontmatter: {
          id: `${baseId}.${i + 1}`,
          type: "note",
          status: "draft",
          updated_at: updatedAt,
        },
        body: section,
        claimIds: this.extractClaimIds(section),
        evidence: this.extractEvidence(section),
      });
    });
    return pages;
  }

  async readAllInDirAsNoteChunks(subdir: string): Promise<WikiPage[]> {
    const glob = new Glob(`${subdir}/**/*.md`);
    const pages: WikiPage[] = [];
    for await (const file of glob.scan({ cwd: this.memoryDir })) {
      if (file.endsWith("README.md")) continue;
      pages.push(...(await this.readNoteChunks(file)));
    }
    return pages;
  }

  /** `## ` 헤딩 기준으로 본문을 나눈다. 첫 구간(제목/서문)도 chunk 0 으로 포함. */
  private splitByH2(text: string): string[] {
    const lines = text.split("\n");
    const sections: string[] = [];
    let current: string[] = [];
    for (const line of lines) {
      if (/^##\s+/.test(line) && current.length > 0) {
        sections.push(current.join("\n"));
        current = [line];
      } else {
        current.push(line);
      }
    }
    if (current.length > 0) sections.push(current.join("\n"));
    return sections;
  }

  private extractClaimIds(body: string): string[] {
    const ids: string[] = [];
    for (const m of body.matchAll(CLAIM_ID_RE)) {
      ids.push(m[1]!);
    }
    return ids;
  }

  private extractEvidence(body: string): string[] {
    const lines = body.split("\n");
    const result: string[] = [];
    let inEvidence = false;
    for (const line of lines) {
      const heading = /^##\s+(.+)$/.exec(line);
      if (heading) {
        if (heading[1]!.trim().toLowerCase().startsWith("evidence")) {
          inEvidence = true;
          continue;
        }
        if (inEvidence) break;
        continue;
      }
      if (!inEvidence) continue;
      const bullet = /^[-*]\s+(.+)$/.exec(line);
      if (bullet) result.push(bullet[1]!.trim());
    }
    return result;
  }
}
