import type { CanonicalEvent } from "../core/events/CanonicalEvent";
import type { Storage } from "../core/storage/Storage";
import type { Clock } from "../core/clock/Clock";
import type { ActiveProblemStore } from "../core/binder/ActiveProblemStore";
import type { PendingQueue } from "../core/ledger/PendingQueue";
import type { RawLedger } from "../core/ledger/RawLedger";
import type { Expirer } from "../core/ledger/Expirer";
import type { ObservationBundler } from "../core/flow/ObservationBundler";
import type { CueCardInjector } from "../core/flow/CueCardInjector";
import type { CueCardFallback } from "../core/flow/CueCardFallback";
import { FLOW_CONFIG } from "../core/flow/config";
import type { OntologyModule } from "../core/ontology/OntologyModule";
import type { ResumeSheetReader } from "../core/compaction/ResumeSheetReader";
import type { ResumeSheet } from "../core/compaction/types";
import type { StaleDecayEngine } from "../core/governance/StaleDecayEngine";
import type { PromotionLedger } from "../core/identity/PromotionLedger";

export const PROMOTION_NUDGE_THRESHOLD = 5;

export type HookDeps = {
  storage: Storage;
  clock: Clock;
  problemStore: ActiveProblemStore;
  queue: PendingQueue;
  ledger: RawLedger;
  expirer: Expirer;
  bundler: ObservationBundler;
  injector: CueCardInjector;
  fallback: CueCardFallback;
  ontologyModule?: OntologyModule;
  resumeReader?: ResumeSheetReader;
  decayEngine?: StaleDecayEngine;
  promotionLedger?: PromotionLedger;
};

const IDENTITY_FILES = [
  "telos.md",
  "persona.md",
  "user.md",
  "tools.md",
  "voice.md",
  "beliefs.md",
  "models.md",
  "strategies.md",
  "ideas.md",
] as const;
const IDENTITY_LABELS: Record<(typeof IDENTITY_FILES)[number], string> = {
  "telos.md": "Telos",
  "persona.md": "Persona",
  "user.md": "User",
  "tools.md": "Tools",
  "voice.md": "Voice",
  "beliefs.md": "Beliefs",
  "models.md": "Models",
  "strategies.md": "Strategies",
  "ideas.md": "Ideas",
};
const IDENTITY_PER_FILE_BYTES = 320;
const IDENTITY_TOTAL_BYTES = 1600;

function stripTemplateChrome(content: string): string {
  return content
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^#+.*$/gm, "")
    .replace(/^>.*$/gm, "")
    .replace(/^\s*\d+\.\s*$/gm, "")
    .replace(/^\s*[-*+]\s*$/gm, "");
}

export function isIdentityEmpty(content: string | null): boolean {
  if (!content) return true;
  const stripped = stripTemplateChrome(content).replace(/\s+/g, "");
  return stripped.length === 0;
}

function firstMeaningfulParagraph(content: string): string {
  const lines = content
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n");
  const picked: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (picked.length > 0) break;
      continue;
    }
    if (line.startsWith("#")) continue;
    if (line.startsWith(">")) continue;
    if (/^\d+\.\s*$/.test(line)) continue;
    if (/^[-*+]\s*$/.test(line)) continue;
    picked.push(line);
  }
  return picked.join(" ").replace(/\s+/g, " ").trim();
}

function clipToBytes(text: string, maxBytes: number): string {
  const enc = new TextEncoder();
  const bytes = enc.encode(text);
  if (bytes.byteLength <= maxBytes) return text;
  const slice = bytes.subarray(0, maxBytes);
  const dec = new TextDecoder("utf-8", { fatal: false });
  return dec.decode(slice).replace(/\s+\S*$/, "").trimEnd() + "…";
}

async function shouldNudgeIdentity(storage: Storage): Promise<boolean> {
  for (const f of IDENTITY_FILES) {
    const content = await storage.readText(`identity/${f}`);
    if (content === null) return false;
    if (!isIdentityEmpty(content)) return false;
  }
  return true;
}

export async function buildIdentityDigest(storage: Storage): Promise<string[]> {
  const rows: string[] = [];
  let totalBytes = 0;
  const enc = new TextEncoder();
  for (const f of IDENTITY_FILES) {
    const content = await storage.readText(`identity/${f}`);
    if (!content || isIdentityEmpty(content)) continue;
    const paragraph = firstMeaningfulParagraph(content);
    if (!paragraph) continue;
    const clipped = clipToBytes(paragraph, IDENTITY_PER_FILE_BYTES);
    const row = `- **${IDENTITY_LABELS[f]}:** ${clipped}`;
    const rowBytes = enc.encode(row).byteLength;
    if (totalBytes + rowBytes > IDENTITY_TOTAL_BYTES) break;
    rows.push(row);
    totalBytes += rowBytes;
  }
  if (rows.length === 0) return [];
  return ["### 🪞 identity", ...rows];
}

function formatResumeSheet(sheet: ResumeSheet, currentProblemId: string | null): string[] {
  const lines: string[] = [];
  lines.push("### 🔁 이전 세션 재개");

  if (sheet.problemId && currentProblemId && sheet.problemId !== currentProblemId) {
    lines.push(`(이전 문제 \`${sheet.problemId}\`에서 세이브됨)`);
  }
  lines.push(`세이브 시각: ${sheet.generatedAt}`);

  if (sheet.recentDeltas.length > 0) {
    lines.push("");
    lines.push("**최근 변경:**");
    for (const d of sheet.recentDeltas.slice(-5)) {
      lines.push(`- ${d.summary}`);
    }
  }

  if (sheet.openGaps.length > 0) {
    lines.push("");
    lines.push(`**미해결 gap:** ${sheet.openGaps.length}개`);
    const top = sheet.openGaps[0];
    if (top) {
      lines.push(`(최고 voi: ${top.detectorId} severity=${top.severity.toFixed(2)})`);
    }
  }

  if (sheet.topPendingQuestions.length > 0) {
    lines.push("");
    lines.push("**다음 질문:**");
    for (const q of sheet.topPendingQuestions) {
      lines.push(`- [voi=${q.voi.toFixed(2)}] ${q.label}`);
    }
  }

  return lines;
}

export async function handleSessionStart(
  event: CanonicalEvent,
  deps: HookDeps
): Promise<string> {
  await deps.ledger.append(event);
  await deps.expirer.sweep(deps.queue);

  if (deps.decayEngine) {
    const active = await deps.problemStore.getActive();
    if (active) {
      try {
        await deps.decayEngine.sweep(active.id);
      } catch (e) {
        console.error("[session-start] decay sweep failed:", e);
      }
    }
  }

  const active = await deps.problemStore.getActive();
  const pendingCount = await deps.queue.count();

  const lines: string[] = ["### 🧠 memory-brain"];

  const identityDigest = await buildIdentityDigest(deps.storage);
  if (identityDigest.length > 0) {
    lines.push("");
    lines.push(...identityDigest);
  }

  if (deps.resumeReader) {
    let resumeSheet: ResumeSheet | null = null;
    try {
      resumeSheet = await deps.resumeReader.consume();
    } catch (e) {
      console.error("[session-start] resume reader failed:", e);
    }
    if (resumeSheet) {
      lines.push("");
      lines.push(...formatResumeSheet(resumeSheet, active?.id ?? null));
      lines.push("");
    }
  }

  if (!active) {
    lines.push("초기화됨. `/cfgm-new-problem`으로 문제를 생성하세요.");
  } else {
    lines.push(`**문제:** ${active.title} (\`${active.slug}\`)`);
    lines.push(`확인: ${active.lastConfirmedAt}`);

    if (deps.ontologyModule) {
      const moduleData = await deps.ontologyModule.read(active.id);
      if (moduleData) {
        lines.push(`**템플릿:** ${moduleData.templateId} v${moduleData.templateVersion}`);
        lines.push(`**완료 횟수:** ${moduleData.resolvedRuns} / 3`);
      }
    }

    const cueCardPath = `problems/${active.id}/cue-card.md`;
    let cueCardMd = await deps.storage.readText(cueCardPath);

    const unprocessedBundles = await deps.bundler.listUnprocessed(active.id);

    if (!cueCardMd && unprocessedBundles.length > 0) {
      cueCardMd = deps.fallback.generate(active.id, active.title, unprocessedBundles);
    }

    if (cueCardMd) {
      const budgetBytes = Math.floor(FLOW_CONFIG.STDOUT_INJECT_BUDGET_KB * 1024);
      const projected = deps.injector.projectForStdout(cueCardMd, budgetBytes);
      lines.push("");
      lines.push(projected);
    }

    if (unprocessedBundles.length >= FLOW_CONFIG.PENDING_WARN_THRESHOLD) {
      lines.push("");
      lines.push(`> 미처리 번들 ${unprocessedBundles.length}개 — "처리해줘"라고 말하면 합성합니다 (또는 \`/cfgm-process\`).`);
    }
  }

  if (pendingCount > 0) {
    lines.push(`**대기 분석:** ${pendingCount}건 → "처리해줘"라고 말하면 됩니다.`);
  }

  if (await shouldNudgeIdentity(deps.storage)) {
    lines.push("");
    lines.push("> 💡 identity 파일이 모두 비어 있습니다 — \"identity 인터뷰 시작해줘\"라고 말하면 3분 대화로 채워집니다. (스킬: cfgm-identity-bootstrap)");
  }

  if (deps.promotionLedger) {
    const pendingPromotions = await deps.promotionLedger.list({ status: "pending" });
    if (pendingPromotions.length >= PROMOTION_NUDGE_THRESHOLD) {
      lines.push("");
      lines.push(`> 🔔 promotion pending 후보 ${pendingPromotions.length}건 — "검토해줘"라고 말하거나 \`/cfgm-promote\` 호출.`);
    }
  }

  return lines.join("\n");
}

if (import.meta.main) {
  const { runHook } = await import("../adapters/claude-code/hook-runner");
  const { buildDeps } = await import("./bootstrap");
  const deps = buildDeps();
  await runHook(async (event) => handleSessionStart(event, deps));
}
