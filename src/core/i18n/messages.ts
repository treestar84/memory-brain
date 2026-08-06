/**
 * i18n/messages — cfgm 데모 경로 CLI(search/ask/stats/doctor) 사용자-facing 메시지 테이블.
 *
 * 언어 판정 우선순위:
 *   1. `CFGM_LANG` 명시값 ("en"/"ko") — 사용자가 명시적으로 지정했으므로 최우선 존중.
 *   2. `LC_ALL`/`LC_MESSAGES`/`LANG` (POSIX locale 환경변수, 이 순서로 확인) 값이
 *      "ko" 로 시작하면 ko.
 *   3. 위 셋 중 하나라도 값이 있으면 (ko 가 아니므로) en — 예: `LANG=en_US.UTF-8`
 *      사용자가 한국어 출력을 받는 회귀를 막는다.
 *   4. 아무 신호도 없으면 기존 기본값 ko 유지.
 * ko 경로는 항상 기존 문자열과 완전히 동일해야 한다 — 기존 테스트가 이를 회귀 감시한다.
 *
 * 외부 i18n 라이브러리는 사용하지 않는다 (docs/RULES.md 의존성 최소화 원칙).
 */

export type Lang = "ko" | "en";

/** locale 값에서 encoding/modifier(`.UTF-8`, `@euro` 등)를 제거해 언어 코드만 남긴다. */
function localeLanguage(value: string): string {
  return value.split(/[.@]/)[0]!.toLowerCase();
}

export function currentLang(): Lang {
  const explicit = process.env.CFGM_LANG;
  if (explicit === "en" || explicit === "ko") return explicit;

  for (const key of ["LC_ALL", "LC_MESSAGES", "LANG"] as const) {
    const raw = process.env[key];
    if (!raw) continue;
    const lang = localeLanguage(raw);
    // "C"/"POSIX" 는 실제 언어 신호가 아니라 "locale 없음"을 뜻하는 POSIX 관례값
    // — 무신호로 취급하고 다음 변수(또는 기본값)로 넘어간다.
    if (lang === "" || lang === "c" || lang === "posix") continue;
    return lang.startsWith("ko") ? "ko" : "en";
  }

  return "ko";
}

// biome-ignore lint/suppress-any: 메시지 값은 정적 문자열 또는 포맷 함수 어느 쪽도 가능해야 한다.
type MessageValue = string | ((...args: any[]) => string);

interface MessageEntry {
  ko: MessageValue;
  en: MessageValue;
}

const MESSAGES: Record<string, MessageEntry> = {
  // ---- 공용 ----
  "common.none": {
    ko: "(없음)",
    en: "(none)",
  },
  "index.notFound": {
    ko: "검색 인덱스가 없습니다 — 먼저 실행: cfgm rebuild-index",
    en: "Search index not found — run first: cfgm rebuild-index",
  },

  // ---- cfgm search ----
  "search.usage": {
    ko: '사용법: cfgm search "<질의>" [--limit N] [--json]',
    en: 'Usage: cfgm search "<query>" [--limit N] [--json]',
  },
  "search.noResults": {
    ko: (query: string) => `"${query}" — 결과 없음. 인덱스에 관련 wiki page 가 없거나 어휘가 다를 수 있습니다.`,
    en: (query: string) =>
      `"${query}" — no results. The index may not have a related wiki page, or the wording may differ.`,
  },
  "search.resultsHeader": {
    ko: (query: string, count: number) => `"${query}" — ${count}건\n`,
    en: (query: string, count: number) => `"${query}" — ${count} result(s)\n`,
  },

  // ---- cfgm ask ----
  "ask.usage": {
    ko: '사용법: cfgm ask "<질의>" [--limit N] [--json]',
    en: 'Usage: cfgm ask "<query>" [--limit N] [--json]',
  },
  "ask.noGrounds": {
    ko: (query: string) => `"${query}" — 근거 없음. 인덱스에 관련 wiki page 가 없거나 어휘가 다를 수 있습니다.`,
    en: (query: string) =>
      `"${query}" — no grounds. The index may not have a related wiki page, or the wording may differ.`,
  },
  "ask.noGroundsSuggestions": {
    ko: () => `\n인덱스에 있는 페이지 (질의 어휘를 이 목록에서 골라 다시 물어보세요):`,
    en: () => `\nPages in the index (try rephrasing your query using terms from this list):`,
  },
  "ask.noGroundsSuggestionLine": {
    ko: (pageId: string, type: string) => `  - ${pageId} [${type}]`,
    en: (pageId: string, type: string) => `  - ${pageId} [${type}]`,
  },
  "ask.groundsHeader": {
    ko: (query: string, count: number) => `질의: "${query}" — 근거 ${count}건\n`,
    en: (query: string, count: number) => `Query: "${query}" — ${count} ground(s)\n`,
  },
  "ask.instruction": {
    ko: (query: string) =>
      `위 근거만 사용해 질문에 답하라. 각 주장 끝에 (근거: <pageId> / <claim-id>) 형식의 ` +
      `pointer 를 인용하라. 위 근거로 답할 수 없으면 추측하지 말고 '메모리에 근거 없음' 이라고 답하라. ` +
      `질문: ${query}`,
    en: (query: string) =>
      `Answer using only the grounds above. Cite (source: <pageId> / <claim-id>) after each statement. ` +
      `If the grounds are insufficient, reply 'no grounds in memory' — do not guess. ` +
      `Question: ${query}`,
  },
  "ask.tokenFooter": {
    ko: (bundleTokens: number, corpusTokens: number, pct: number) =>
      `\n--- 근거 번들 ~${bundleTokens} tokens · 전체 메모리 ~${corpusTokens} tokens 의 ${pct}% (추정: chars/4)`,
    en: (bundleTokens: number, corpusTokens: number, pct: number) =>
      `\n--- grounds bundle ~${bundleTokens} tokens · ${pct}% of total memory ~${corpusTokens} tokens (estimate: chars/4)`,
  },

  // ---- cfgm stats ----
  "stats.noData": {
    ko: (days: number) => `최근 ${days}일 — 아직 사용 기록 없음. cfgm search 를 사용해 보세요.`,
    en: (days: number) => `Last ${days} day(s) — no usage recorded yet. Try cfgm search.`,
  },
  "stats.header": {
    ko: (days: number) => `cfgm 사용 통계 — 최근 ${days}일\n`,
    en: (days: number) => `cfgm usage stats — last ${days} day(s)\n`,
  },
  "stats.searchCount": {
    ko: (n: number) => `검색(search): ${n}회`,
    en: (n: number) => `Searches: ${n}`,
  },
  "stats.askCount": {
    ko: (n: number) => `질의(ask): ${n}회`,
    en: (n: number) => `Asks: ${n}`,
  },
  "stats.uniqueQueries": {
    ko: (n: number) => `고유 질의: ${n}건`,
    en: (n: number) => `Unique queries: ${n}`,
  },
  "stats.contextLine": {
    ko: (tokens: number, pct: number) => `전달 컨텍스트: ~${tokens} tokens (전량 주입 대비 ~${pct}% 절감 — 추정치)`,
    en: (tokens: number, pct: number) => `Context delivered: ~${tokens} tokens (~${pct}% savings vs full injection — estimate)`,
  },
  "stats.topQueriesLabel": {
    ko: "자주 찾은 질의:",
    en: "Top queries:",
  },
  "stats.topQueryLine": {
    ko: (count: number, query: string) => `  ${count}회  ${query}`,
    en: (count: number, query: string) => `  ${count}x  ${query}`,
  },
  "stats.topPagesLabel": {
    ko: "\n자주 매칭된 페이지:",
    en: "\nTop matched pages:",
  },
  "stats.topPageLine": {
    ko: (count: number, pageId: string) => `  ${count}회  ${pageId}`,
    en: (count: number, pageId: string) => `  ${count}x  ${pageId}`,
  },
  "stats.dailyTrendLabel": {
    ko: "\n일별 추이:",
    en: "\nDaily trend:",
  },
  "stats.none": {
    ko: "  (없음)",
    en: "  (none)",
  },

  // ---- cfgm doctor ----
  "doctor.header": {
    ko: "cfgm doctor — CFGM-OS 자가진단\n",
    en: "cfgm doctor — CFGM-OS self-check\n",
  },
  "doctor.allPass": {
    ko: "\n모든 필수 점검 통과.",
    en: "\nAll required checks passed.",
  },
  "doctor.someFail": {
    ko: (n: number) => `\n필수 점검 실패 ${n}건 — 위 → 조치를 실행하세요.`,
    en: (n: number) => `\n${n} required check(s) failed — run the → fix(es) above.`,
  },
  "doctor.check.bun.name": {
    ko: "Bun ≥ 1.1",
    en: "Bun ≥ 1.1",
  },
  "doctor.check.deps.name": {
    ko: "의존성 (bun install)",
    en: "Dependencies (bun install)",
  },
  "doctor.check.deps.detail.ok": {
    ko: "node_modules OK",
    en: "node_modules OK",
  },
  "doctor.check.deps.detail.fail": {
    ko: "node_modules 없음",
    en: "node_modules missing",
  },
  "doctor.check.repo.name": {
    ko: "memory/ 레이아웃",
    en: "memory/ layout",
  },
  "doctor.check.repo.detail.ok": {
    ko: "ROUTER.md OK",
    en: "ROUTER.md OK",
  },
  "doctor.check.repo.detail.fail": {
    ko: "memory/ROUTER.md 없음 — repo 루트가 아닌 곳에서 실행?",
    en: "memory/ROUTER.md missing — running outside repo root?",
  },
  "doctor.check.index.name": {
    ko: "검색 인덱스",
    en: "Search index",
  },
  "doctor.check.index.detail.exists": {
    ko: (indexPath: string, ageDays: number) => `${indexPath} (${ageDays}일 전 갱신)`,
    en: (indexPath: string, ageDays: number) => `${indexPath} (updated ${ageDays} day(s) ago)`,
  },
  "doctor.check.index.fix.stale": {
    ko: "cfgm rebuild-index  # 7일 이상 경과 — 재생성 권장",
    en: "cfgm rebuild-index  # over 7 days old — rebuild recommended",
  },
  "doctor.check.index.detail.missing": {
    ko: "미생성 (최초 실행 시 정상)",
    en: "not built yet (normal on first run)",
  },
  "doctor.check.index.fix.missing": {
    ko: "cfgm rebuild-index",
    en: "cfgm rebuild-index",
  },
  "doctor.check.vectorDims.name": {
    ko: "벡터 차원 정합성",
    en: "Vector dims match",
  },
  "doctor.check.vectorDims.detail.match": {
    ko: (dims: string) => `dims=${dims} 일치`,
    en: (dims: string) => `dims=${dims} match`,
  },
  "doctor.check.vectorDims.detail.mismatch": {
    ko: (stored: string, current: string) =>
      `인덱스는 dims=${stored}, 현재 embedder는 dims=${current} — 불일치 (hybrid 검색이 조용히 FTS-only 로 저하됨)`,
    en: (stored: string, current: string) =>
      `index has dims=${stored}, current embedder has dims=${current} — mismatch (hybrid search silently degrades to FTS-only)`,
  },
  "doctor.check.vectorDims.detail.none": {
    ko: "벡터 미포함 인덱스 (lexical-only) — 정합성 검사 대상 아님",
    en: "index has no vectors (lexical-only) — nothing to check",
  },
  "doctor.check.mergeConflicts.name": {
    ko: "git 충돌 마커",
    en: "git conflict markers",
  },
  "doctor.check.mergeConflicts.detail.clean": {
    ko: "memory/**/*.jsonl 에 충돌 마커 없음",
    en: "no conflict markers in memory/**/*.jsonl",
  },
  "doctor.check.mergeConflicts.detail.found": {
    ko: (files: string) => `충돌 마커 발견: ${files} — 해당 줄이 claim 원장에서 조용히 스킵되고 있을 수 있음`,
    en: (files: string) => `conflict markers found: ${files} — those lines may be silently skipped from the claim ledger`,
  },
  "doctor.check.mergeConflicts.fix": {
    ko: "충돌 마커가 있는 파일을 직접 열어 <<<<<<< / ======= / >>>>>>> 를 정리하세요 (git merge=union 을 쓰면 이후엔 마커 자체가 안 생김 — .gitattributes 확인)",
    en: "manually resolve the <<<<<<< / ======= / >>>>>>> markers in the listed files (git merge=union prevents markers going forward — check .gitattributes)",
  },
  "doctor.check.sslQueue.name": {
    ko: "SSL 큐",
    en: "SSL queue",
  },
  "doctor.check.sslQueue.fix.stale": {
    ko: "cfgm ssl-reap",
    en: "cfgm ssl-reap",
  },
  "doctor.check.sslQueue.fix.pending": {
    ko: "PAI 세션에서 처리: CLAUDE_CONFIG_DIR=.claude-pai claude",
    en: "Process in a PAI session: CLAUDE_CONFIG_DIR=.claude-pai claude",
  },
  "doctor.check.governance.name": {
    ko: "Governance (중복/stale/모순)",
    en: "Governance (duplicate/stale/contradiction)",
  },
  "doctor.check.governance.fix": {
    ko: "cfgm governance-report 실행 후 memory/reports/ 검토",
    en: "Run cfgm governance-report and review memory/reports/",
  },
  "doctor.check.brain.name": {
    ko: "Brain 프로파일 (선택)",
    en: "Brain profile (optional)",
  },
  "doctor.check.brain.detail.installed": {
    ko: (brainHome: string) => `${brainHome} 설치됨`,
    en: (brainHome: string) => `${brainHome} installed`,
  },
  "doctor.check.brain.detail.notInstalled": {
    ko: "미설치 — 훅 통합 없이도 CLI 는 모두 동작",
    en: "not installed — all CLI commands work without hook integration",
  },
  "doctor.check.brain.fix": {
    ko: "./install.sh  # Claude Code 훅 통합을 원하면",
    en: "./install.sh  # if you want Claude Code hook integration",
  },
  "doctor.check.lme.name": {
    ko: "LongMemEval 데이터 (선택)",
    en: "LongMemEval dataset (optional)",
  },
  "doctor.check.lme.detail.downloaded": {
    ko: "다운로드됨",
    en: "downloaded",
  },
  "doctor.check.lme.detail.missing": {
    ko: "없음 — bench-lme 실행 시에만 필요",
    en: "not present — only needed to run bench-lme",
  },
};

/**
 * t — 메시지 조회. lang 은 process.env.CFGM_LANG 으로 결정된다 ("en" 이 아니면 ko).
 *
 * @param key MESSAGES 테이블 키
 * @param args 메시지가 포맷 함수인 경우 전달할 인자
 */
export function t(key: string, ...args: unknown[]): string {
  const entry = MESSAGES[key];
  if (!entry) return key;
  const value = entry[currentLang()];
  return typeof value === "function" ? value(...args) : value;
}
