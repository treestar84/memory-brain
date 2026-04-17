import { describe, test, expect, beforeEach } from "bun:test";
import { Redactor } from "../../../src/core/security/Redactor";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { FakeClock } from "../../../src/core/clock/Clock";

describe("Redactor", () => {
  let storage: MemoryStorage;
  let redactor: Redactor;

  beforeEach(() => {
    storage = new MemoryStorage();
    redactor = new Redactor(storage, new FakeClock());
  });

  test("redacts Anthropic API key", async () => {
    const { text, redacted } = await redactor.redact("key is sk-ant-abcdefghijklmnopqrstuv");
    expect(redacted).toBe(true);
    expect(text).toContain("<REDACTED:anthropic-key>");
    expect(text).not.toContain("sk-ant-");
  });

  test("redacts OpenAI key", async () => {
    const { text, redacted } = await redactor.redact("sk-abcdefghijklmnopqrstuvwxyz");
    expect(redacted).toBe(true);
    expect(text).toContain("<REDACTED:openai-key>");
  });

  test("redacts AWS key", async () => {
    const { text } = await redactor.redact("AKIAIOSFODNN7EXAMPLE");
    expect(text).toContain("<REDACTED:aws-key>");
  });

  test("redacts JWT token", async () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123";
    const { text } = await redactor.redact(jwt);
    expect(text).toContain("<REDACTED:jwt>");
  });

  test("redacts password field", async () => {
    const { text } = await redactor.redact('password="mysecretpass123"');
    expect(text).toContain("<REDACTED:password-field>");
  });

  test("leaves clean text unchanged", async () => {
    const { text, redacted } = await redactor.redact("normal code without secrets");
    expect(redacted).toBe(false);
    expect(text).toBe("normal code without secrets");
  });

  test("logs to redacted.jsonl", async () => {
    await redactor.redact("sk-ant-abcdefghijklmnopqrstuv");
    const logs = await storage.readJsonl<{ patternName: string }>("security/redacted.jsonl");
    expect(logs.length).toBe(1);
    expect(logs[0].patternName).toBe("anthropic-key");
  });
});
