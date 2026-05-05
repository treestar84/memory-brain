#!/usr/bin/env bun
import { resolve } from "node:path";
import { validateSSL, type SSLDocument } from "../src/core/ontology/ssl";

/**
 * cfgm-ssl-validate — 단일 SSL JSON 파일을 validateSSL gate 로 검증.
 *
 * 사용법:
 *   bun run bin/cfgm-ssl-validate.ts <path-to-ssl.json>
 *
 * 종료 코드:
 *   0 — schema valid, warnings 없음
 *   1 — schema invalid (자세한 사유 stderr)
 *   2 — 파일 read / JSON parse 실패
 *   3 — 인자 부족
 *
 * docs/RULES.md 원칙 2 준수: LLM API 호출 없음.
 */

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error("usage: bun run bin/cfgm-ssl-validate.ts <path-to-ssl.json>");
  process.exit(3);
}

const target = resolve(process.cwd(), args[0]);
const file = Bun.file(target);
if (!(await file.exists())) {
  console.error(`error: file not found — ${target}`);
  process.exit(2);
}

let doc: SSLDocument;
try {
  doc = (await file.json()) as SSLDocument;
} catch (e) {
  console.error(`error: invalid JSON — ${(e as Error).message}`);
  process.exit(2);
}

let errors: string[];
try {
  errors = validateSSL(doc);
} catch (e) {
  console.error(`error: schema crash — ${(e as Error).message}`);
  process.exit(1);
}

const warnings = Array.isArray(doc.warnings) ? doc.warnings : [];

if (errors.length === 0 && warnings.length === 0) {
  console.log(`✓ valid — ${target}`);
  process.exit(0);
}

if (errors.length > 0) {
  console.error(`✗ schema invalid — ${target}`);
  for (const e of errors) console.error(`  - ${e}`);
}
if (warnings.length > 0) {
  console.error(`✗ unresolved warnings (host LLM 이 메우지 못함) — ${target}`);
  for (const w of warnings) console.error(`  - ${w}`);
}
process.exit(1);
