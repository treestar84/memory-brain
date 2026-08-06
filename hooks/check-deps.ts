#!/usr/bin/env bun
/**
 * SessionStart 훅: 플러그인 의존성(`node_modules/yaml`)이 설치돼 있는지 확인한다.
 *
 * 기존에는 hooks.json 의 command 가 POSIX 셸 문법(`test -d ... && exit 0; echo ...`)을
 * 직접 사용해 Windows(cmd.exe) 에서 실패했다. Bun 스크립트로 옮겨 플랫폼 독립적으로
 * 동일한 동작을 재현한다: 의존성이 설치돼 있으면 조용히 종료, 없으면 안내 메시지만
 * 출력하고 종료(둘 다 항상 exit 0 — 세션 시작을 막지 않는다).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? process.cwd();
const yamlDir = join(pluginRoot, "node_modules", "yaml");

if (!existsSync(yamlDir)) {
  console.log(
    "[memory-brain] Dependencies not installed yet. Run /memory-brain:setup once (bun install, with your confirmation).",
  );
}
