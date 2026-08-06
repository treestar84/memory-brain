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

  test("--consolidated 시 3조건(naive/governed/consolidated) 출력 + consolidation 통계 로그", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "cfgm-rot-bench-consolidated-"));
    writeSyntheticDataset(projectRoot);
    const reportPath = join(projectRoot, "memory", "reports", "rot-bench-latest.md");

    const res = cfgmRotBench(["--consolidated"], { CFGM_PROJECT_ROOT: projectRoot });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("naive");
    expect(res.stdout).toContain("governed");
    expect(res.stdout).toContain("consolidated");
    expect(res.stdout).toContain("consolidation —");
    expect(existsSync(reportPath)).toBe(true);

    const report = Bun.file(reportPath).text();
    return report.then((md) => {
      expect(md).toContain("| consolidated |");
      expect(md).toContain("## Consolidation 통계");
    });
  });

  test("--adapter 시 external 조건이 스텁 어댑터로 채점되어 리포트/stdout 에 반영된다", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "cfgm-rot-bench-adapter-"));
    writeSyntheticDataset(projectRoot);
    const reportPath = join(projectRoot, "memory", "reports", "rot-bench-latest.md");

    // --adapter 는 quote-aware 토크나이저로 command 를 분리한다 (셸 이스케이프는
    // 미지원). 스텁을 별도 파일로 써서 "bun <path>" 형태로 전달한다.
    // 항상 s1 을 1순위로 응답하는 고정 스텁 — q_full_cohort 의 정답(s1)은 hit,
    // q_late_answer 의 정답(s4)은 miss 가 되어 external 조건이 실제로 채점되는지 확인한다.
    const adapterPath = join(projectRoot, "fixed-stub-adapter.ts");
    writeFileSync(
      adapterPath,
      `for await (const line of console) {
  if (!line) continue;
  let req; try { req = JSON.parse(line); } catch { continue; }
  console.log(JSON.stringify({ id: req.id, ranked: ["s1"] }));
}
`,
    );
    const res = cfgmRotBench(["--adapter", `bun ${adapterPath}`, "--adapter-label", "fixed-stub"], {
      CFGM_PROJECT_ROOT: projectRoot,
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("fixed-stub");
    expect(res.stdout).toContain("adapter[fixed-stub]");
    expect(existsSync(reportPath)).toBe(true);

    const report = Bun.file(reportPath).text();
    return report.then((md) => {
      expect(md).toContain("| fixed-stub |");
      expect(md).toContain("fixed-stub");
    });
  });

  test("--adapter 값에 공백 포함 경로가 따옴표로 감싸져 있으면 하나의 인자로 파싱된다", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "cfgm-rot-bench-adapter-quoted-"));
    writeSyntheticDataset(projectRoot);
    const reportPath = join(projectRoot, "memory", "reports", "rot-bench-latest.md");

    // 공백을 포함한 디렉토리에 스텁을 둬서, 따옴표로 감싸지 않으면 argv 가
    // 깨져(bun 이 존재하지 않는 경로로 실행 시도) 어댑터 프로세스가 죽는지 검증한다.
    const spacedDir = join(projectRoot, "My Adapters");
    mkdirSync(spacedDir, { recursive: true });
    const adapterPath = join(spacedDir, "fixed stub adapter.ts");
    writeFileSync(
      adapterPath,
      `for await (const line of console) {
  if (!line) continue;
  let req; try { req = JSON.parse(line); } catch { continue; }
  console.log(JSON.stringify({ id: req.id, ranked: ["s1"] }));
}
`,
    );
    const res = cfgmRotBench(["--adapter", `bun '${adapterPath}'`, "--adapter-label", "quoted-stub"], {
      CFGM_PROJECT_ROOT: projectRoot,
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("adapter[quoted-stub]");
    expect(existsSync(reportPath)).toBe(true);

    const report = Bun.file(reportPath).text();
    return report.then((md) => {
      expect(md).toContain("| quoted-stub |");
    });
  });
});
