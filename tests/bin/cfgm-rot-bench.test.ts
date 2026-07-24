import { describe, test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function cfgmRotBench(args: string[], env: Record<string, string>) {
  return spawnSync("bun", ["run", "bin/cfgm-rot-bench.ts", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: "utf-8",
  });
}

// 합성 소형 데이터셋 — 4개 haystack 세션 전부에서 answer 커버되는 문항 1개 +
// 마지막 세션에서만 answer 가 등장해 초반 체크포인트에서 cohort 제외되는 문항 1개.
function writeSyntheticDataset(projectRoot: string): string {
  const dataDir = join(projectRoot, "data", "longmemeval");
  mkdirSync(dataDir, { recursive: true });
  const dataPath = join(dataDir, "longmemeval_s_cleaned.json");
  const questions = [
    {
      question_id: "q_full_cohort",
      question_type: "single-session-user",
      question: "What degree did I graduate with?",
      haystack_session_ids: ["s1", "s2", "s3", "s4"],
      haystack_dates: ["2023/01/10 (Tue)", "2023/02/01 (Wed)", "2023/03/05 (Sun)", "2023/04/20 (Thu)"],
      haystack_sessions: [
        [{ role: "user", content: "I graduated with a business administration degree last spring." }],
        [{ role: "user", content: "My cat knocked over the coffee mug again." }],
        [{ role: "user", content: "Planning a hiking trip to the mountains next month." }],
        [{ role: "user", content: "Quarterly report deadline is Friday." }],
      ],
      answer_session_ids: ["s1"],
    },
    {
      question_id: "q_late_answer",
      question_type: "single-session-user",
      question: "What is the deadline for the quarterly report?",
      haystack_session_ids: ["s1", "s2", "s3", "s4"],
      haystack_dates: ["2023/01/10 (Tue)", "2023/02/01 (Wed)", "2023/03/05 (Sun)", "2023/04/20 (Thu)"],
      haystack_sessions: [
        [{ role: "user", content: "I graduated with a business administration degree last spring." }],
        [{ role: "user", content: "My cat knocked over the coffee mug again." }],
        [{ role: "user", content: "Planning a hiking trip to the mountains next month." }],
        [{ role: "user", content: "Quarterly report deadline is Friday." }],
      ],
      answer_session_ids: ["s4"],
    },
  ];
  writeFileSync(dataPath, JSON.stringify(questions));
  return dataPath;
}

describe("cfgm-rot-bench CLI", () => {
  test("데이터셋 파일이 없으면 exit 1 + 다운로드 안내", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "cfgm-rot-bench-"));
    const res = cfgmRotBench([], { CFGM_PROJECT_ROOT: projectRoot });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("dataset not found");
    expect(res.stderr).toContain("longmemeval-cleaned");
  });

  test("--sample 에 유효하지 않은 값이면 exit 1", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "cfgm-rot-bench-"));
    const res = cfgmRotBench(["--sample", "not-a-number"], { CFGM_PROJECT_ROOT: projectRoot });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("invalid --sample");
  });

  test("--cohort 시 rot-bench-cohort-latest.md 생성 + 기존 rot-bench-latest.md 는 미변경", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "cfgm-rot-bench-cohort-"));
    writeSyntheticDataset(projectRoot);
    const defaultReportPath = join(projectRoot, "memory", "reports", "rot-bench-latest.md");
    const cohortReportPath = join(projectRoot, "memory", "reports", "rot-bench-cohort-latest.md");

    expect(existsSync(defaultReportPath)).toBe(false);

    const res = cfgmRotBench(["--cohort"], { CFGM_PROJECT_ROOT: projectRoot });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("mode=cohort");
    expect(existsSync(cohortReportPath)).toBe(true);
    // 기존(all 모드) 리포트 파일은 --cohort 실행으로 생성되지 않는다 — 두 리포트 공존.
    expect(existsSync(defaultReportPath)).toBe(false);

    const cohortReport = Bun.file(cohortReportPath).text();
    return cohortReport.then((md) => {
      expect(md).toContain("cohort");
      expect(md).toContain("동일 문항 집단");
    });
  });
});
