import { describe, test, expect, beforeEach } from "bun:test";
import { MemoryStorage } from "../../../src/core/storage/MemoryStorage";
import { ResumeSheetReader } from "../../../src/core/compaction/ResumeSheetReader";
import { resumeSheetPath } from "../../../src/core/compaction/config";
import { RESUME_SHEET_VERSION } from "../../../src/core/compaction/types";

function sampleSheet(generatedAt: string, sessionId: string) {
  return {
    version: RESUME_SHEET_VERSION,
    generatedAt,
    sessionId,
    problemId: "p-1",
    recentDeltas: [],
    openGaps: [],
    topPendingQuestions: [],
  };
}

describe("ResumeSheetReader", () => {
  let storage: MemoryStorage;
  let reader: ResumeSheetReader;

  beforeEach(() => {
    storage = new MemoryStorage();
    reader = new ResumeSheetReader(storage);
  });

  test("파일 없음 → null", async () => {
    const result = await reader.consume();
    expect(result).toBeNull();
  });

  test("단일 파일 consume → 읽고 삭제", async () => {
    await storage.writeJsonAtomic(
      resumeSheetPath("sid-1"),
      sampleSheet("2026-04-19T10:00:00.000Z", "sid-1"),
    );
    const result = await reader.consume();
    expect(result?.sessionId).toBe("sid-1");
    expect(await storage.exists(resumeSheetPath("sid-1"))).toBe(false);
  });

  test("여러 파일 → 가장 최신만 반환, 모두 삭제", async () => {
    await storage.writeJsonAtomic(
      resumeSheetPath("old"),
      sampleSheet("2026-04-19T09:00:00.000Z", "old"),
    );
    await storage.writeJsonAtomic(
      resumeSheetPath("new"),
      sampleSheet("2026-04-19T10:00:00.000Z", "new"),
    );
    await storage.writeJsonAtomic(
      resumeSheetPath("mid"),
      sampleSheet("2026-04-19T09:30:00.000Z", "mid"),
    );
    const result = await reader.consume();
    expect(result?.sessionId).toBe("new");
    expect(await storage.exists(resumeSheetPath("old"))).toBe(false);
    expect(await storage.exists(resumeSheetPath("new"))).toBe(false);
    expect(await storage.exists(resumeSheetPath("mid"))).toBe(false);
  });

  test("JSON 파싱 실패 → null 반환 + 파일 삭제", async () => {
    await storage.writeRaw(resumeSheetPath("broken"), "not json {{{");
    const result = await reader.consume();
    expect(result).toBeNull();
    expect(await storage.exists(resumeSheetPath("broken"))).toBe(false);
  });

  test("version 불일치 → null 반환 + 파일 삭제", async () => {
    await storage.writeJsonAtomic(resumeSheetPath("stale"), {
      version: "resume-sheet@9.9.9",
      generatedAt: "2026-04-19T10:00:00.000Z",
      sessionId: "stale",
    });
    const result = await reader.consume();
    expect(result).toBeNull();
    expect(await storage.exists(resumeSheetPath("stale"))).toBe(false);
  });

  test("state 디렉터리에 무관한 파일 있음 → 무시", async () => {
    await storage.writeJsonAtomic("state/current-gaps.json", {});
    await storage.writeJsonAtomic("state/current-turn-foo.json", {});
    await storage.writeJsonAtomic(
      resumeSheetPath("sid-1"),
      sampleSheet("2026-04-19T10:00:00.000Z", "sid-1"),
    );
    const result = await reader.consume();
    expect(result?.sessionId).toBe("sid-1");
    expect(await storage.exists("state/current-gaps.json")).toBe(true);
    expect(await storage.exists("state/current-turn-foo.json")).toBe(true);
  });
});
