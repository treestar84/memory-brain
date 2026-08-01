import { describe, test, expect } from "bun:test";
import {
  parseClaudeCodeTranscript,
  renderClaudeCodeSessionMarkdown,
} from "../../../src/core/import/ClaudeCodeImporter";

function line(obj: unknown): string {
  return JSON.stringify(obj);
}

describe("ClaudeCodeImporter", () => {
  test("extracts plain-string user turns and text-block assistant turns", () => {
    const jsonl = [
      line({ type: "user", sessionId: "s1", timestamp: "2026-04-26T00:00:00Z", message: { role: "user", content: "hello" } }),
      line({ type: "assistant", timestamp: "2026-04-26T00:00:01Z", message: { role: "assistant", content: [{ type: "text", text: "hi there" }] } }),
    ].join("\n");

    const session = parseClaudeCodeTranscript(jsonl);
    expect(session.sessionId).toBe("s1");
    expect(session.firstTimestamp).toBe("2026-04-26T00:00:00Z");
    expect(session.lastTimestamp).toBe("2026-04-26T00:00:01Z");
    expect(session.turns).toEqual([
      { role: "user", text: "hello" },
      { role: "assistant", text: "hi there" },
    ]);
  });

  test("skips tool_use/tool_result/thinking blocks — a turn with only those produces no turn", () => {
    const jsonl = [
      line({ type: "assistant", message: { role: "assistant", content: [{ type: "thinking", thinking: "..." }] } }),
      line({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", name: "Read", input: {} }] } }),
      line({ type: "user", message: { role: "user", content: [{ type: "tool_result", content: "file contents..." }] } }),
    ].join("\n");

    const session = parseClaudeCodeTranscript(jsonl);
    expect(session.turns).toEqual([]);
  });

  test("multiple text blocks in one assistant message join with blank line", () => {
    const jsonl = line({
      type: "assistant",
      message: { role: "assistant", content: [{ type: "text", text: "part one" }, { type: "text", text: "part two" }] },
    });
    const session = parseClaudeCodeTranscript(jsonl);
    expect(session.turns).toEqual([{ role: "assistant", text: "part one\n\npart two" }]);
  });

  test("skips malformed JSON lines without throwing (parity with parseJsonlLenient)", () => {
    const jsonl = [
      line({ type: "user", message: { role: "user", content: "ok before" } }),
      "{ this is not valid json",
      line({ type: "user", message: { role: "user", content: "ok after" } }),
    ].join("\n");
    const session = parseClaudeCodeTranscript(jsonl);
    expect(session.turns.map((t) => t.text)).toEqual(["ok before", "ok after"]);
  });

  test("ignores non-user/assistant line types (queue-operation, attachment, etc.)", () => {
    const jsonl = [
      line({ type: "queue-operation", operation: "enqueue", sessionId: "s1" }),
      line({ type: "attachment", attachment: { type: "hook_success" } }),
      line({ type: "user", message: { role: "user", content: "actual message" } }),
    ].join("\n");
    const session = parseClaudeCodeTranscript(jsonl);
    expect(session.turns).toEqual([{ role: "user", text: "actual message" }]);
  });

  test("empty input yields empty session, no throw", () => {
    const session = parseClaudeCodeTranscript("");
    expect(session).toEqual({ sessionId: null, firstTimestamp: null, lastTimestamp: null, turns: [] });
  });

  test("renderClaudeCodeSessionMarkdown — headings per turn + source path + timestamps", () => {
    const session = parseClaudeCodeTranscript(
      [
        line({ type: "user", sessionId: "s1", timestamp: "2026-04-26T00:00:00Z", message: { role: "user", content: "q" } }),
        line({ type: "assistant", timestamp: "2026-04-26T00:00:01Z", message: { role: "assistant", content: [{ type: "text", text: "a" }] } }),
      ].join("\n"),
    );
    const md = renderClaudeCodeSessionMarkdown(session, "/tmp/foo.jsonl");
    expect(md).toContain("# Claude Code session — s1");
    expect(md).toContain("/tmp/foo.jsonl");
    expect(md).toContain("## User");
    expect(md).toContain("q");
    expect(md).toContain("## Assistant");
    expect(md).toContain("a");
    expect(md).toContain("시작: 2026-04-26T00:00:00Z");
    expect(md).toContain("종료: 2026-04-26T00:00:01Z");
  });
});
