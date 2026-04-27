import type { Storage } from "../../storage/Storage";
import type { DetectorReport } from "./types";

/**
 * DetectorReport → markdown → storage 저장 (PR-V3.7).
 *
 * 저장 위치: `reports/<detectorId>.md` (storage root 기준).
 * 즉 .memory-brain/reports/<id>.md 가 사용자별 운영 결과 영역.
 */
export class ReportWriter {
  constructor(private readonly storage: Storage) {}

  async write(report: DetectorReport): Promise<string> {
    const path = `reports/${report.detectorId}.md`;
    await this.storage.writeRaw(path, this.toMarkdown(report));
    return path;
  }

  toMarkdown(report: DetectorReport): string {
    const lines: string[] = [
      `# ${report.detectorId}`,
      ``,
      `- **generatedAt**: ${report.generatedAt}`,
      `- **findings**: ${report.findings.length}`,
      ``,
      `## Summary`,
      ``,
      report.summary,
      ``,
    ];

    if (report.findings.length === 0) {
      lines.push(`## Findings`, ``, `(없음)`, ``);
      return lines.join("\n");
    }

    lines.push(`## Findings`, ``);
    for (const f of report.findings) {
      const sev = f.severity.toUpperCase();
      lines.push(`### [${sev}] ${f.subject}`);
      lines.push(``);
      lines.push(f.message);
      if (f.evidence && f.evidence.length > 0) {
        lines.push(``, `- evidence:`);
        for (const e of f.evidence) lines.push(`  - ${e}`);
      }
      lines.push(``);
    }
    return lines.join("\n");
  }
}
