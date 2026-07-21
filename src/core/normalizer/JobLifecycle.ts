import yaml from "yaml";

/**
 * Pending normalize queue 의 실패 시맨틱 (V3.28).
 *
 * 기존 큐 (PR-V3.13-rev2) 는 pending → in_progress → done|failed 상태만 있고
 * host LLM 이 job 을 잡은 채 죽거나 (orphan lease), 같은 job 이 무한 재시도
 * 되는 경로에 보호가 없었다. 본 모듈이 추가하는 계약:
 *
 * - **claim**: pending → in_progress 전이 시 attempts+1 + lease_expires_at 기록.
 * - **lease**: in_progress 가 lease 만료를 넘기면 orphan 으로 판정.
 * - **reap**: orphan 은 attempts < max_attempts 면 pending 재큐, 아니면 failed.
 * - **legacy 관용**: lease_expires_at 없는 구형 in_progress job 은 파일 mtime
 *   + TTL 로 만료를 판정한다 (구형 job 도 회수 가능, back-compat).
 *
 * 순수 텍스트 변환 함수만 제공 — 파일 I/O 는 CLI (cfgm-ssl-reap) 책임.
 */

export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_LEASE_MINUTES = 60;

export type JobStatus = "pending" | "in_progress" | "done" | "failed";

export interface JobFrontmatter {
  job_id?: string;
  status: JobStatus;
  attempts?: number;
  max_attempts?: number;
  lease_expires_at?: string;
  failure_reason?: string;
  [key: string]: unknown;
}

export interface ParsedJob {
  frontmatter: JobFrontmatter;
  body: string;
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
const VALID_STATUSES: ReadonlySet<string> = new Set(["pending", "in_progress", "done", "failed"]);

export function parseJob(text: string): ParsedJob | null {
  const m = FRONTMATTER_RE.exec(text);
  if (!m) return null;
  let fm: unknown;
  try {
    fm = yaml.parse(m[1]!);
  } catch {
    return null;
  }
  if (!fm || typeof fm !== "object") return null;
  const status = (fm as Record<string, unknown>).status;
  if (typeof status !== "string" || !VALID_STATUSES.has(status)) return null;
  return { frontmatter: fm as JobFrontmatter, body: m[2] ?? "" };
}

export function serializeJob(job: ParsedJob): string {
  return `---\n${yaml.stringify(job.frontmatter).trimEnd()}\n---\n${job.body}`;
}

/**
 * pending job 을 처리 주체가 점유 (claim). attempts 증가 + lease 기록.
 * pending 이 아니면 null (이미 점유/완료 — 이중 처리 방지).
 */
export function claimJob(
  text: string,
  nowIso: string,
  opts: { leaseMinutes?: number } = {},
): string | null {
  const job = parseJob(text);
  if (!job || job.frontmatter.status !== "pending") return null;
  const leaseMinutes = opts.leaseMinutes ?? DEFAULT_LEASE_MINUTES;
  const lease = new Date(new Date(nowIso).getTime() + leaseMinutes * 60_000).toISOString();
  job.frontmatter.status = "in_progress";
  job.frontmatter.attempts = (job.frontmatter.attempts ?? 0) + 1;
  job.frontmatter.max_attempts = job.frontmatter.max_attempts ?? DEFAULT_MAX_ATTEMPTS;
  job.frontmatter.lease_expires_at = lease;
  delete job.frontmatter.failure_reason;
  return serializeJob(job);
}

export type ReapAction = "none" | "requeued" | "failed";

export interface ReapDecision {
  action: ReapAction;
  /** action ≠ none 일 때 갱신된 파일 내용 */
  text?: string;
  reason?: string;
}

/**
 * orphan in_progress job 회수 판정.
 *
 * @param fileMtimeIso lease_expires_at 없는 legacy job 의 만료 판정 기준 (파일 mtime)
 */
export function reapJob(
  text: string,
  opts: {
    nowIso: string;
    ttlMinutes?: number;
    maxAttempts?: number;
    fileMtimeIso?: string;
  },
): ReapDecision {
  const job = parseJob(text);
  if (!job) return { action: "none", reason: "unparseable frontmatter" };
  if (job.frontmatter.status !== "in_progress") return { action: "none" };

  const now = new Date(opts.nowIso).getTime();
  const ttlMinutes = opts.ttlMinutes ?? DEFAULT_LEASE_MINUTES;

  let expired: boolean;
  if (typeof job.frontmatter.lease_expires_at === "string") {
    const lease = new Date(job.frontmatter.lease_expires_at).getTime();
    expired = Number.isFinite(lease) ? now > lease : true;
  } else if (opts.fileMtimeIso) {
    // legacy job (lease 없음) — 마지막 수정 후 TTL 경과 시 orphan
    expired = now > new Date(opts.fileMtimeIso).getTime() + ttlMinutes * 60_000;
  } else {
    expired = false;
  }
  if (!expired) return { action: "none" };

  const attempts = job.frontmatter.attempts ?? 1;
  const maxAttempts = opts.maxAttempts ?? job.frontmatter.max_attempts ?? DEFAULT_MAX_ATTEMPTS;

  if (attempts >= maxAttempts) {
    job.frontmatter.status = "failed";
    job.frontmatter.failure_reason = `lease expired after ${attempts} attempt(s) — max_attempts (${maxAttempts}) reached`;
    delete job.frontmatter.lease_expires_at;
    return { action: "failed", text: serializeJob(job), reason: job.frontmatter.failure_reason };
  }

  job.frontmatter.status = "pending";
  delete job.frontmatter.lease_expires_at;
  delete job.frontmatter.failure_reason;
  return {
    action: "requeued",
    text: serializeJob(job),
    reason: `lease expired — requeued (attempt ${attempts}/${maxAttempts})`,
  };
}

/** failed job 을 attempts 리셋과 함께 수동 재큐 (사용자 명시 재시도). */
export function requeueFailedJob(text: string): string | null {
  const job = parseJob(text);
  if (!job || job.frontmatter.status !== "failed") return null;
  job.frontmatter.status = "pending";
  job.frontmatter.attempts = 0;
  delete job.frontmatter.failure_reason;
  delete job.frontmatter.lease_expires_at;
  return serializeJob(job);
}

/** in_progress job 의 lease 가 만료됐는지 (status CLI 의 stale 표시용). */
export function isStale(
  fm: JobFrontmatter,
  nowIso: string,
  fileMtimeIso?: string,
  ttlMinutes: number = DEFAULT_LEASE_MINUTES,
): boolean {
  if (fm.status !== "in_progress") return false;
  const now = new Date(nowIso).getTime();
  if (typeof fm.lease_expires_at === "string") {
    const lease = new Date(fm.lease_expires_at).getTime();
    return Number.isFinite(lease) ? now > lease : true;
  }
  if (fileMtimeIso) return now > new Date(fileMtimeIso).getTime() + ttlMinutes * 60_000;
  return false;
}
