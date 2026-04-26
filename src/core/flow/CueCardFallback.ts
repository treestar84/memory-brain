import type { ObservationBundle } from "./types";

export class CueCardFallback {
  generate(problemId: string, problemTitle: string, bundles: ObservationBundle[]): string {
    const fileFreq = new Map<string, number>();
    const toolFreq = new Map<string, number>();
    let totalSuccess = 0, totalFailure = 0, promptCount = 0;
    let lastBundleAt: string | null = null;

    for (const b of bundles) {
      for (const f of b.metrics.touchedFiles) fileFreq.set(f, (fileFreq.get(f) ?? 0) + 1);
      for (const [k, v] of Object.entries(b.metrics.toolCallCounts)) toolFreq.set(k, (toolFreq.get(k) ?? 0) + v);
      totalSuccess += b.metrics.bashExit.success;
      totalFailure += b.metrics.bashExit.failure;
      promptCount += b.metrics.promptCount;
      if (!lastBundleAt || b.sealedAt > lastBundleAt) lastBundleAt = b.sealedAt;
    }

    const fileLines = [...fileFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([f, n]) => `  - ${f} (${n}회)`)
      .join("\n");

    const toolLines = [...toolFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `  - ${t}: ${n}`)
      .join("\n");

    const frontMatter = [
      "---",
      `problemId: ${problemId}`,
      `problemTitle: ${JSON.stringify(problemTitle)}`,
      `awaitingSynthesis: true`,
      `pendingBundleCount: ${bundles.length}`,
      `lastBundleAt: ${lastBundleAt ?? "null"}`,
      "---",
    ].join("\n");

    const body = [
      "",
      "## 합성 대기 중",
      `이 문제에 ${bundles.length}개의 ObservationBundle이 미처리 상태입니다. "처리해줘"라고 말하면 Flow Block으로 합성됩니다 (또는 \`/cfgm-process\`).`,
      "",
      "## 활동 지표",
      fileLines ? "터치한 파일:" : "터치한 파일 없음",
      fileLines,
      "",
      toolLines ? "도구 호출:" : "도구 호출 없음",
      toolLines,
      "",
      `bash 종료: 성공 ${totalSuccess} · 실패 ${totalFailure}`,
      `프롬프트 수: ${promptCount}`,
    ].filter(l => l !== "").join("\n");

    return frontMatter + "\n" + body + "\n";
  }
}
