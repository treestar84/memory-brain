import type { CanonicalEvent, StagePayload, Stage } from "../../core/events/CanonicalEvent";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const VERSION_PATH = join(import.meta.dir, "VERSION");
let adapterVersion: string;
try { adapterVersion = "claude-code@" + readFileSync(VERSION_PATH, "utf-8").trim(); }
catch { adapterVersion = "claude-code@unknown"; }

type Raw = Record<string, unknown>;
const STAGE_MAP: Record<string, Stage> = {
  SessionStart: "session-start", UserPromptSubmit: "prompt-submit",
  PreToolUse: "tool-pre", PostToolUse: "tool-post",
  PreCompact: "compact-pre", SessionEnd: "session-end", Stop: "stop",
};

function payload(type: string, r: Raw): StagePayload {
  const corrId = () => "corr-" + randomUUID().slice(0, 12);
  switch (type) {
    case "SessionStart": return { stage: "session-start" };
    // 실제 Claude Code 는 `prompt_text` 를 보낸다(공식 문서 확인). `message` 는
    // 이 프로젝트 초기 fixture/테스트가 잘못 가정했던 필드명 — 하위호환으로 폴백만 유지.
    case "UserPromptSubmit": return { stage: "prompt-submit", message: String(r.prompt_text ?? r.message ?? "") };
    case "PreToolUse": return { stage: "tool-pre", toolName: String(r.tool_name ?? ""), toolInput: r.tool_input, correlationId: corrId() };
    // 실제 Claude Code 는 도구 실행 결과를 `tool_result` 로 보낸다(공식 문서 확인).
    // `tool_output` 은 위와 동일하게 fixture 가 잘못 가정했던 필드명 — 폴백만 유지.
    case "PostToolUse": return { stage: "tool-post", toolName: String(r.tool_name ?? ""), toolInput: r.tool_input, toolOutput: r.tool_result ?? r.tool_output, correlationId: corrId() };
    case "PreCompact": return { stage: "compact-pre", turnCount: Number(r.turn_count ?? 0) };
    case "SessionEnd": return { stage: "session-end" };
    case "Stop": return { stage: "stop" };
    default: throw new Error(`Unknown hook type: ${type}`);
  }
}

/**
 * 실제 Claude Code 는 이벤트 종류를 `hook_event_name` 필드로 보낸다(공식 문서
 * docs.claude.com/en/docs/claude-code/hooks 확인 — session_id/cwd/transcript_path
 * 등 공통 필드도 전부 snake_case). 이 어댑터는 원래 `type` 필드를 기대하도록
 * 작성되어 있었는데, 그건 이 프로젝트가 초기에 잘못 가정한 스키마였다 — 그 결과
 * 실제 Claude Code 세션에서는 모든 훅이 "Unknown hook type: " 로 매번 실패하고
 * (hook-runner.ts 의 catch-all 이 조용히 삼켜 세션 UX 는 안 깨졌지만, 기억 캡처가
 * 전혀 동작하지 않았다 — 실사용 환경에서 수개월간 재현·확인됨). `type` 폴백은
 * 이 프로젝트 자체의 기존 fixture/테스트(`fixtures/claude-code/v1/*.json`)가
 * 이 잘못된 스키마로 작성돼 있어 하위호환으로만 남긴다.
 */
export function mapClaudeCodeEvent(rawInput: unknown, timestampIso: string): CanonicalEvent {
  const r = rawInput as Raw;
  const type = String(r.hook_event_name ?? r.type ?? "");
  const stage = STAGE_MAP[type];
  if (!stage) throw new Error(`Unknown hook type: ${type}`);
  return { platform: "claude-code", stage, sessionId: String(r.session_id ?? ""), cwd: String(r.cwd ?? ""), timestampIso, payload: payload(type, r), raw: rawInput, adapterVersion };
}
