import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { currentLang } from "../../../src/core/i18n/messages";

const LANG_KEYS = ["CFGM_LANG", "LC_ALL", "LC_MESSAGES", "LANG"] as const;

describe("currentLang", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const k of LANG_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of LANG_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  test("아무 신호도 없으면 기존 기본값 ko", () => {
    expect(currentLang()).toBe("ko");
  });

  test("CFGM_LANG=en 은 다른 신호와 무관하게 최우선 존중된다", () => {
    process.env.LANG = "ko_KR.UTF-8";
    process.env.CFGM_LANG = "en";
    expect(currentLang()).toBe("en");
  });

  test("CFGM_LANG=ko 는 다른 신호와 무관하게 최우선 존중된다", () => {
    process.env.LANG = "en_US.UTF-8";
    process.env.CFGM_LANG = "ko";
    expect(currentLang()).toBe("ko");
  });

  test("CFGM_LANG 미설정 + LANG=en_US.UTF-8 이면 en (자동 감지, 회귀 버그 수정 대상)", () => {
    process.env.LANG = "en_US.UTF-8";
    expect(currentLang()).toBe("en");
  });

  test("CFGM_LANG 미설정 + LANG=ko_KR.UTF-8 이면 ko", () => {
    process.env.LANG = "ko_KR.UTF-8";
    expect(currentLang()).toBe("ko");
  });

  test("LC_ALL 이 LANG 보다 우선한다 (POSIX 순서)", () => {
    process.env.LC_ALL = "en_US.UTF-8";
    process.env.LANG = "ko_KR.UTF-8";
    expect(currentLang()).toBe("en");
  });

  test("LC_MESSAGES 가 LANG 보다 우선한다", () => {
    process.env.LC_MESSAGES = "ko_KR.UTF-8";
    process.env.LANG = "en_US.UTF-8";
    expect(currentLang()).toBe("ko");
  });

  test("LANG=C / POSIX 는 실질 신호가 아니므로 기본값 ko 로 처리된다", () => {
    process.env.LANG = "C.UTF-8";
    expect(currentLang()).toBe("ko");

    process.env.LANG = "POSIX";
    expect(currentLang()).toBe("ko");

    process.env.LANG = "C";
    expect(currentLang()).toBe("ko");
  });

  test("LC_ALL=C 인 경우 다음 우선순위(LANG)로 넘어간다", () => {
    process.env.LC_ALL = "C";
    process.env.LANG = "en_US.UTF-8";
    expect(currentLang()).toBe("en");
  });
});
