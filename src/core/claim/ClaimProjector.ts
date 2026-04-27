import type { Storage } from "../storage/Storage";
import type { ClaimCandidate } from "./types";

export class ClaimProjector {
  constructor(private readonly storage: Storage) {}

  async render(claim: ClaimCandidate): Promise<void> {
    const dir = claim.status === "accepted" ? "active" : claim.status;
    const path = `claims/${dir}/${claim.candidateId}.md`;
    await this.storage.writeRaw(path, this.toMarkdown(claim));
  }

  toMarkdown(c: ClaimCandidate): string {
    const lines = [
      `# ${c.candidateId}`,
      ``,
      `- **type**: ${c.proposedType}`,
      `- **status**: ${c.status}`,
      `- **confidence**: ${c.confidence}`,
      `- **detectedBy**: ${c.detectedBy}`,
      `- **createdAt**: ${c.createdAt}`,
      `- **decidedAt**: ${c.decidedAt ?? "—"}`,
      `- **decidedBy**: ${c.decidedBy ?? "—"}`,
    ];

    // Graphiti supersede 모델 (PR-V3.5)
    if (c.validFrom) lines.push(`- **validFrom**: ${c.validFrom}`);
    if (c.validTo) lines.push(`- **validTo**: ${c.validTo}`);
    if (c.invalidAt) lines.push(`- **invalidAt**: ${c.invalidAt}`);
    if (c.supersededBy) lines.push(`- **supersededBy**: ${c.supersededBy}`);

    lines.push(
      ``,
      `## text`,
      ``,
      c.proposedText,
      ``,
      `## evidence`,
      ``,
      ...c.evidence.map((e) => `- ${e.source}${e.quote ? ` — "${e.quote}"` : ""}`),
    );

    if (c.reason) {
      lines.push("", `## reason`, ``, c.reason);
    }
    return lines.join("\n") + "\n";
  }
}
