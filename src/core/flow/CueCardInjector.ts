export class CueCardInjector {
  private readonly encoder = new TextEncoder();

  projectForStdout(cueCardMd: string, budgetBytes: number): string {
    if (this.encoder.encode(cueCardMd).length <= budgetBytes) return cueCardMd;

    const { frontMatter, body } = this.splitFrontMatter(cueCardMd);
    const sections = this.splitSections(body);

    const frontMatterBytes = this.encoder.encode(frontMatter).length;
    const omissionReserve = 120;
    const budgetForBody = Math.max(0, budgetBytes - frontMatterBytes - omissionReserve);

    const included: string[] = [];
    let used = 0;
    let omittedCount = 0;

    for (const sec of sections) {
      const size = this.encoder.encode(sec).length;
      if (used + size <= budgetForBody) {
        included.push(sec);
        used += size;
      } else {
        omittedCount++;
      }
    }

    const omission = omittedCount > 0
      ? `\n> (섹션 ${omittedCount}개 생략, 풀 뷰: 프로젝트의 \`.memory-brain/problems/<id>/cue-card.md\`)\n`
      : "";

    return frontMatter + included.join("") + omission;
  }

  private splitFrontMatter(md: string): { frontMatter: string; body: string } {
    const m = md.match(/^(---\n[\s\S]*?\n---\n)([\s\S]*)$/);
    if (!m) return { frontMatter: "", body: md };
    return { frontMatter: m[1], body: m[2] };
  }

  private splitSections(body: string): string[] {
    const sections: string[] = [];
    let current = "";
    const lines = body.split("\n");
    for (const line of lines) {
      if (line.startsWith("## ") && current) {
        sections.push(current);
        current = line + "\n";
      } else {
        current += line + "\n";
      }
    }
    if (current) sections.push(current);
    return sections;
  }
}
