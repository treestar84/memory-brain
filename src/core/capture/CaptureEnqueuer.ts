import { mkdir } from "node:fs/promises";
import { resolve, extname, basename } from "node:path";
import { slugify } from "../util/slug";

/**
 * CaptureEnqueuer — capture 큐 job.md 를 SHA-256 stale 체크 후 렌더/기록하는 공용 로직.
 *
 * bin/cfgm-capture.ts (CLI, repo 큐) 와 src/hooks/session-end.ts (자동 capture, storage 큐)
 * 양쪽이 이 모듈을 공유한다. docs/RULES.md 원칙 2 준수 — LLM API 를 호출하지 않는다.
 */

export interface EnqueueSourceOptions {
  /** job.md 본문/frontmatter 에 표기할 원본 경로 (표시용, slug 파생에도 사용). */
  sourcePath: string;
  /** 원본 내용 — SHA-256 계산에 사용. */
  sourceText: string;
  /** job.md 를 실제로 쓸 절대 디렉토리. */
  jobsDir: string;
  /** job.md 본문에 표기할 draft 저장 위치 (표시용 문자열). */
  draftsDir: string;
  /** job.md 본문에 표기할 spec 경로 (표시용 문자열). */
  specDir: string;
  force?: boolean;
  now?: Date;
  /** job.md 본문에 추가로 병기할 안내문 (예: storage 큐 안내). */
  extraNote?: string;
}

export interface EnqueueResult {
  enqueued: boolean;
  skipped: boolean;
  jobPath?: string;
}

export async function sha256(text: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(text);
  return hasher.digest("hex");
}

export function slugFromPath(p: string): string {
  const base = basename(p, extname(p));
  return slugify(base, "capture");
}

export async function enqueueSource(opts: EnqueueSourceOptions): Promise<EnqueueResult> {
  const now = opts.now ?? new Date();
  const generatedAt = now.toISOString();

  await mkdir(opts.jobsDir, { recursive: true });

  const sha = await sha256(opts.sourceText);
  const slug = slugFromPath(opts.sourcePath);
  const jobPath = resolve(opts.jobsDir, `${slug}.job.md`);

  if (!opts.force) {
    const existingJob = Bun.file(jobPath);
    if (await existingJob.exists()) {
      const txt = await existingJob.text();
      if (txt.includes(`source_sha256: ${sha}`)) {
        return { enqueued: false, skipped: true, jobPath };
      }
    }
  }

  const job = renderJobFile({
    slug,
    sourcePath: opts.sourcePath,
    sourceSha: sha,
    draftsDir: opts.draftsDir,
    specDir: opts.specDir,
    generatedAt,
    extraNote: opts.extraNote,
  });
  await Bun.write(jobPath, job);

  return { enqueued: true, skipped: false, jobPath };
}

interface RenderJobOpts {
  slug: string;
  sourcePath: string;
  sourceSha: string;
  draftsDir: string;
  specDir: string;
  generatedAt: string;
  extraNote?: string;
}

function renderJobFile(o: RenderJobOpts): string {
  return [
    `---`,
    `job_id: cap-${o.generatedAt.slice(0, 10)}-${o.slug}`,
    `status: pending`,
    `attempts: 0`,
    `max_attempts: 3`,
    `source_path: ${o.sourcePath}`,
    `source_sha256: ${o.sourceSha}`,
    `drafts_dir: ${o.draftsDir}`,
    `enqueued_at: ${o.generatedAt}`,
    `---`,
    ``,
    `# Capture job — \`${o.slug}\``,
    ``,
    `이 작업의 처리 방법은 [\`${o.specDir}/prompt.md\`](${o.specDir}/prompt.md) 를 먼저 읽고 따른다.`,
    ...(o.extraNote ? [``, o.extraNote] : []),
    ``,
    `## 입력`,
    ``,
    `- 원본: [\`${o.sourcePath}\`](${o.sourcePath}) — SHA-256 \`${o.sourceSha}\``,
    ``,
    `## 완료 후`,
    ``,
    `1. 기억할 가치가 있는 지식 후보마다 \`${o.draftsDir}/<page-slug>.md\` 에 wiki page draft 저장 (WIKI-FORMAT.md 준수, \`status: draft\`).`,
    `2. 본 파일 frontmatter 를 \`status: done\` 으로 갱신.`,
    `3. 실패 시 \`status: failed\` + \`failure_reason: <사유>\` 추가.`,
    ``,
  ].join("\n");
}
