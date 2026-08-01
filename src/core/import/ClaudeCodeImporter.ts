/**
 * ClaudeCodeImporter — Claude Code 자체 세션 transcript(`~/.claude/projects/<sanitized-cwd>/<uuid>.jsonl`)
 * 를 사람이 읽을 수 있는 markdown 세션 노트로 정규화한다 (V3.44, 멀티소스 임포트 1호).
 *
 * 왜 CLI 도구/claude-mem 류처럼 대화를 곧장 claim 으로 만들지 않는가: 대화 →
 * 지식 추출은 의미 판단이 필요한데, 그걸 이 코드가 하려면 LLM API 를 부르거나
 * (원칙 2 위반) 조악한 휴리스틱으로 inference 를 fact 처럼 저장(CLAUDE.md 절대
 * 규칙 위반)해야 한다. 이 모듈은 **결정론적 형식 변환만** 하고, 의미 추출은
 * 이미 있는 capture 파이프라인(memory/_pending/capture/, host LLM 위임)에
 * 넘긴다 — `bin/cfgm-import.ts` 가 이 출력을 `enqueueSource()` 로 큐에 올린다.
 *
 * 원본 transcript 는 tool_use/tool_result/thinking 블록이 대부분이라 그대로
 * capture 에 넘기면 노이즈가 크다. 이 모듈은 user 의 실제 발화와 assistant 의
 * text 블록만 골라내 대화 형태로 재구성한다 — 무엇을 버렸는지는 손실 없이
 * "버렸다"는 사실 자체를 기록하지 않는다(정보 손실이 아니라 노이즈 제거이므로).
 */

interface RawContentBlock {
  type?: string;
  text?: string;
}

interface RawTranscriptLine {
  type?: string;
  sessionId?: string;
  timestamp?: string;
  message?: {
    role?: string;
    content?: string | RawContentBlock[];
  };
}

export interface ClaudeCodeTurn {
  role: "user" | "assistant";
  text: string;
}

export interface ClaudeCodeSession {
  sessionId: string | null;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  turns: ClaudeCodeTurn[];
}

/** message.content 에서 사람이 쓴/읽은 텍스트만 추출. tool_use/tool_result/thinking 은 제외. */
function extractText(content: string | RawContentBlock[] | undefined): string | null {
  if (typeof content === "string") {
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (!Array.isArray(content)) return null;
  const texts = content
    .filter((b) => b?.type === "text" && typeof b.text === "string")
    .map((b) => b.text!.trim())
    .filter((t) => t.length > 0);
  return texts.length > 0 ? texts.join("\n\n") : null;
}

/**
 * transcript JSONL 텍스트 → 정규화된 세션. 파싱 실패 줄은 건너뛴다
 * (jsonl.ts 의 parseJsonlLenient 와 같은 원칙 — 일부 손상이 전체를 막지 않음).
 */
export function parseClaudeCodeTranscript(jsonlText: string): ClaudeCodeSession {
  const turns: ClaudeCodeTurn[] = [];
  let sessionId: string | null = null;
  let firstTimestamp: string | null = null;
  let lastTimestamp: string | null = null;

  for (const line of jsonlText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj: RawTranscriptLine;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (obj.sessionId && !sessionId) sessionId = obj.sessionId;
    if (obj.timestamp) {
      if (!firstTimestamp) firstTimestamp = obj.timestamp;
      lastTimestamp = obj.timestamp;
    }
    if (obj.type !== "user" && obj.type !== "assistant") continue;
    const role = obj.message?.role;
    if (role !== "user" && role !== "assistant") continue;
    const text = extractText(obj.message?.content);
    if (!text) continue; // tool_result-only user turn, or tool_use-only assistant turn
    turns.push({ role, text });
  }

  return { sessionId, firstTimestamp, lastTimestamp, turns };
}

/** 세션을 markdown 대화록으로 렌더 (frontmatter 는 호출자가 별도로 붙임 — WIKI-FORMAT 미적용, sources 는 형식 자유). */
export function renderClaudeCodeSessionMarkdown(session: ClaudeCodeSession, sourcePath: string): string {
  const lines: string[] = [];
  lines.push(`# Claude Code session — ${session.sessionId ?? "unknown-session"}`);
  lines.push("");
  lines.push(`원본: \`${sourcePath}\``);
  if (session.firstTimestamp) lines.push(`시작: ${session.firstTimestamp}`);
  if (session.lastTimestamp) lines.push(`종료: ${session.lastTimestamp}`);
  lines.push("");
  for (const turn of session.turns) {
    lines.push(`## ${turn.role === "user" ? "User" : "Assistant"}`);
    lines.push("");
    lines.push(turn.text);
    lines.push("");
  }
  return lines.join("\n");
}
