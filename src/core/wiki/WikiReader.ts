import { Glob } from "bun";
import { resolve } from "node:path";
import yaml from "yaml";
import type { WikiPage, WikiPageFrontmatter } from "./types";

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
const CLAIM_ID_RE = /<!--\s*claim:(cl-[\w-]+)\s*-->/g;

/**
 * Wiki Layer 1차 reader (PR-V3.4).
 *
 * memory/{projects,concepts,decisions}/star.md 의 frontmatter + claim id +
 * evidence 추출. Bun.file 직접 사용 (Storage interface 우회 - git 트래킹된
 * memory/ 디렉토리는 .memory-brain storage root 와 별도).
 *
 * 후속 PR-V3.5 에서 ClaimStore 와 cross-reference, PR-V3.6 에서 sqlite 인덱스.
 */
export class WikiReader {
  constructor(private readonly memoryDir: string = resolve(process.cwd(), "memory")) {}

  async read(relativePath: string): Promise<WikiPage | null> {
    const fullPath = resolve(this.memoryDir, relativePath);
    const file = Bun.file(fullPath);
    if (!(await file.exists())) return null;
    const text = await file.text();
    return this.parse(relativePath, text);
  }

  parse(relativePath: string, text: string): WikiPage | null {
    const match = FRONTMATTER_RE.exec(text);
    if (!match) return null;
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
