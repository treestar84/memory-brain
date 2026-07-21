import { describe, test, expect } from "bun:test";
import {
  parseJob,
  serializeJob,
  claimJob,
  reapJob,
  requeueFailedJob,
  isStale,
  DEFAULT_MAX_ATTEMPTS,
} from "../../../src/core/normalizer/JobLifecycle";

const NOW = "2026-07-21T12:00:00.000Z";

function jobText(fm: Record<string, unknown>): string {
  const lines = Object.entries(fm).map(([k, v]) => `${k}: ${v}`);
  return `---\n${lines.join("\n")}\n---\n\n# Normalize job\n\nbody text\n`;
}

const PENDING = jobText({
  job_id: "norm-2026-07-21-example",
  status: "pending",
  attempts: 0,
  max_attempts: 3,
  source_path: ".claude/skills/example/SKILL.md",
});

describe("JobLifecycle (V3.28 실패 시맨틱)", () => {
  test("parseJob — frontmatter + body 분리, 잘못된 status/yaml 은 null", () => {
    const job = parseJob(PENDING)!;
    expect(job.frontmatter.status).toBe("pending");
    expect(job.frontmatter.attempts).toBe(0);
    expect(job.body).toContain("# Normalize job");
    expect(parseJob("no frontmatter")).toBeNull();
    expect(parseJob(jobText({ status: "weird" }))).toBeNull();
    expect(parseJob("---\n[broken yaml\n---\nbody")).toBeNull();
  });

  test("serializeJob round-trip — body 보존", () => {
    const job = parseJob(PENDING)!;
    const back = parseJob(serializeJob(job))!;
    expect(back.frontmatter.job_id).toBe("norm-2026-07-21-example");
    expect(back.body).toBe(job.body);
  });

  test("claimJob — pending → in_progress + attempts+1 + lease 기록", () => {
    const claimed = claimJob(PENDING, NOW)!;
    const fm = parseJob(claimed)!.frontmatter;
    expect(fm.status).toBe("in_progress");
    expect(fm.attempts).toBe(1);
    expect(fm.max_attempts).toBe(3);
    expect(fm.lease_expires_at).toBe("2026-07-21T13:00:00.000Z");
  });

  test("claimJob — attempts/max_attempts 없는 legacy job 도 동작", () => {
    const legacy = jobText({ job_id: "j", status: "pending" });
    const fm = parseJob(claimJob(legacy, NOW)!)!.frontmatter;
    expect(fm.attempts).toBe(1);
    expect(fm.max_attempts).toBe(DEFAULT_MAX_ATTEMPTS);
  });

  test("claimJob — pending 이 아니면 null (이중 점유 방지)", () => {
    const inProgress = jobText({ status: "in_progress" });
    expect(claimJob(inProgress, NOW)).toBeNull();
    expect(claimJob(jobText({ status: "done" }), NOW)).toBeNull();
  });

  test("reapJob — lease 유효한 in_progress 는 none", () => {
    const text = claimJob(PENDING, NOW)!;
    const d = reapJob(text, { nowIso: "2026-07-21T12:30:00.000Z" });
    expect(d.action).toBe("none");
  });

  test("reapJob — lease 만료 + attempts < max → pending 재큐 (attempts 유지)", () => {
    const text = claimJob(PENDING, NOW)!;
    const d = reapJob(text, { nowIso: "2026-07-21T14:00:00.000Z" });
    expect(d.action).toBe("requeued");
    const fm = parseJob(d.text!)!.frontmatter;
    expect(fm.status).toBe("pending");
    expect(fm.attempts).toBe(1);
    expect(fm.lease_expires_at).toBeUndefined();
  });

  test("reapJob — lease 만료 + attempts ≥ max → failed + failure_reason", () => {
    const exhausted = jobText({
      status: "in_progress",
      attempts: 3,
      max_attempts: 3,
      lease_expires_at: "2026-07-21T11:00:00.000Z",
    });
    const d = reapJob(exhausted, { nowIso: NOW });
    expect(d.action).toBe("failed");
    const fm = parseJob(d.text!)!.frontmatter;
    expect(fm.status).toBe("failed");
    expect(fm.failure_reason).toContain("max_attempts");
  });

  test("reapJob — legacy job (lease 없음) 은 mtime + TTL 로 판정", () => {
    const legacy = jobText({ status: "in_progress", attempts: 1 });
    const fresh = reapJob(legacy, { nowIso: NOW, fileMtimeIso: "2026-07-21T11:30:00.000Z" });
    expect(fresh.action).toBe("none");
    const stale = reapJob(legacy, { nowIso: NOW, fileMtimeIso: "2026-07-21T09:00:00.000Z" });
    expect(stale.action).toBe("requeued");
  });

  test("reapJob — legacy job + mtime 없음 → 보수적으로 none", () => {
    const legacy = jobText({ status: "in_progress" });
    expect(reapJob(legacy, { nowIso: NOW }).action).toBe("none");
  });

  test("reapJob — pending/done/failed/파싱불가 는 none", () => {
    expect(reapJob(PENDING, { nowIso: NOW }).action).toBe("none");
    expect(reapJob(jobText({ status: "done" }), { nowIso: NOW }).action).toBe("none");
    expect(reapJob("garbage", { nowIso: NOW }).action).toBe("none");
  });

  test("reapJob — maxAttempts CLI override 가 frontmatter 보다 우선", () => {
    const text = jobText({
      status: "in_progress",
      attempts: 2,
      max_attempts: 5,
      lease_expires_at: "2026-07-21T11:00:00.000Z",
    });
    expect(reapJob(text, { nowIso: NOW, maxAttempts: 2 }).action).toBe("failed");
  });

  test("requeueFailedJob — failed → pending + attempts 리셋", () => {
    const failed = jobText({ status: "failed", attempts: 3, failure_reason: "boom" });
    const fm = parseJob(requeueFailedJob(failed)!)!.frontmatter;
    expect(fm.status).toBe("pending");
    expect(fm.attempts).toBe(0);
    expect(fm.failure_reason).toBeUndefined();
    expect(requeueFailedJob(PENDING)).toBeNull();
  });

  test("isStale — lease 만료된 in_progress 만 true", () => {
    const fm = parseJob(claimJob(PENDING, NOW)!)!.frontmatter;
    expect(isStale(fm, "2026-07-21T12:30:00.000Z")).toBe(false);
    expect(isStale(fm, "2026-07-21T14:00:00.000Z")).toBe(true);
    expect(isStale(parseJob(PENDING)!.frontmatter, NOW)).toBe(false);
    const legacy = parseJob(jobText({ status: "in_progress" }))!.frontmatter;
    expect(isStale(legacy, NOW, "2026-07-21T09:00:00.000Z")).toBe(true);
    expect(isStale(legacy, NOW)).toBe(false);
  });
});
