import { test, expect, beforeEach, afterEach, describe } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SettingsReader } from "../../../src/core/settings/SettingsReader";
import { FLOW_CONFIG } from "../../../src/core/flow/config";

describe("SettingsReader", () => {
  let tmp: string;
  let settingsPath: string;
  let originalErr: typeof console.error;
  let errLogs: string[];

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "settings-reader-"));
    settingsPath = join(tmp, "settings.json");
    errLogs = [];
    originalErr = console.error;
    console.error = (msg: unknown) => { errLogs.push(String(msg)); };
  });

  afterEach(() => {
    console.error = originalErr;
    rmSync(tmp, { recursive: true, force: true });
  });

  test("R1: 파일 없음 → FLOW_CONFIG 기본값 반환", async () => {
    const reader = new SettingsReader(settingsPath);
    const policy = await reader.getQuestionPolicy();
    expect(policy.cooldownMinutes).toBe(FLOW_CONFIG.QUESTION_POLICY.COOLDOWN_MINUTES);
    expect(policy.dailyCap).toBe(FLOW_CONFIG.QUESTION_POLICY.DAILY_CAP);
    expect(errLogs).toHaveLength(0);
  });

  test("R2: memoryBrain.questionPolicy override 반영", async () => {
    writeFileSync(settingsPath, JSON.stringify({
      hooks: { SessionStart: [] },
      memoryBrain: { questionPolicy: { cooldownMinutes: 60, dailyCap: 10 } },
    }));
    const reader = new SettingsReader(settingsPath);
    const policy = await reader.getQuestionPolicy();
    expect(policy.cooldownMinutes).toBe(60);
    expect(policy.dailyCap).toBe(10);
  });

  test("R3: JSON 깨짐 → 기본값 반환 + stderr 경고", async () => {
    writeFileSync(settingsPath, "{ this is not valid json");
    const reader = new SettingsReader(settingsPath);
    const policy = await reader.getQuestionPolicy();
    expect(policy.cooldownMinutes).toBe(FLOW_CONFIG.QUESTION_POLICY.COOLDOWN_MINUTES);
    expect(policy.dailyCap).toBe(FLOW_CONFIG.QUESTION_POLICY.DAILY_CAP);
    expect(errLogs.some((m) => m.includes("SettingsReader"))).toBe(true);
  });

  test("R4: hooks만 있고 memoryBrain 누락 → 기본값", async () => {
    writeFileSync(settingsPath, JSON.stringify({
      hooks: { SessionStart: [{ matcher: "*", hooks: [] }] },
    }));
    const reader = new SettingsReader(settingsPath);
    const policy = await reader.getQuestionPolicy();
    expect(policy.cooldownMinutes).toBe(FLOW_CONFIG.QUESTION_POLICY.COOLDOWN_MINUTES);
    expect(policy.dailyCap).toBe(FLOW_CONFIG.QUESTION_POLICY.DAILY_CAP);
    expect(errLogs).toHaveLength(0);
  });

  test("R5: questionPolicy 일부 필드만 override → 있는 것만 반영", async () => {
    writeFileSync(settingsPath, JSON.stringify({
      memoryBrain: { questionPolicy: { cooldownMinutes: 30 } },
    }));
    const reader = new SettingsReader(settingsPath);
    const policy = await reader.getQuestionPolicy();
    expect(policy.cooldownMinutes).toBe(30);
    expect(policy.dailyCap).toBe(FLOW_CONFIG.QUESTION_POLICY.DAILY_CAP);
  });

  test("R6: 타입 불일치(문자열) → 기본값", async () => {
    writeFileSync(settingsPath, JSON.stringify({
      memoryBrain: { questionPolicy: { cooldownMinutes: "60", dailyCap: "10" } },
    }));
    const reader = new SettingsReader(settingsPath);
    const policy = await reader.getQuestionPolicy();
    expect(policy.cooldownMinutes).toBe(FLOW_CONFIG.QUESTION_POLICY.COOLDOWN_MINUTES);
    expect(policy.dailyCap).toBe(FLOW_CONFIG.QUESTION_POLICY.DAILY_CAP);
  });

  test("R7: 음수 → 기본값", async () => {
    writeFileSync(settingsPath, JSON.stringify({
      memoryBrain: { questionPolicy: { cooldownMinutes: -5, dailyCap: -1 } },
    }));
    const reader = new SettingsReader(settingsPath);
    const policy = await reader.getQuestionPolicy();
    expect(policy.cooldownMinutes).toBe(FLOW_CONFIG.QUESTION_POLICY.COOLDOWN_MINUTES);
    expect(policy.dailyCap).toBe(FLOW_CONFIG.QUESTION_POLICY.DAILY_CAP);
  });
});
