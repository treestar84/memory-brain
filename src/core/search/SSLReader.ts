import { Glob } from "bun";
import { resolve } from "node:path";
import { validateSSL, type SSLDocument } from "../ontology/ssl";

/**
 * Read SSL skill documents from `memory/concepts/_ssl/*.json` (PR-V3.14
 * Indexer integration).
 *
 * SSL JSON files are derived artifacts produced by SkillNormalizer
 * (PR-V3.12) — SKILL.md remains source-of-truth. Files that fail
 * validateSSL are skipped (with the failed path returned via `errors`).
 */
export class SSLReader {
  constructor(private readonly memoryDir: string = resolve(process.cwd(), "memory")) {}

  async readAll(): Promise<{ docs: SSLDocument[]; errors: Array<{ path: string; reason: string }> }> {
    const docs: SSLDocument[] = [];
    const errors: Array<{ path: string; reason: string }> = [];
    const glob = new Glob("concepts/_ssl/**/*.json");

    for await (const rel of glob.scan({ cwd: this.memoryDir })) {
      const fullPath = resolve(this.memoryDir, rel);
      const file = Bun.file(fullPath);
      let parsed: unknown;
      try {
        parsed = await file.json();
      } catch (e) {
        errors.push({ path: rel, reason: `json parse: ${(e as Error).message}` });
        continue;
      }
      const doc = parsed as SSLDocument;
      let validationErrors: string[];
      try {
        validationErrors = validateSSL(doc);
      } catch (e) {
        errors.push({ path: rel, reason: `schema crash: ${(e as Error).message}` });
        continue;
      }
      if (validationErrors.length > 0) {
        errors.push({ path: rel, reason: `schema: ${validationErrors.join("; ")}` });
        continue;
      }
      docs.push(doc);
    }
    return { docs, errors };
  }
}
