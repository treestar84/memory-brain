import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import type { ActiveProblemStore } from "../binder/ActiveProblemStore";
import { GOVERNANCE_CONFIG, MS_PER_DAY } from "./config";

const ARCHIVE_INDEX_PATH = ".archive/index.json";

type ArchiveEntry = {
  problemId: string;
  title: string;
  slug: string;
  resolvedAt: string | null;
  archivedAt: string;
};

type ArchiveIndex = {
  version: string;
  entries: ArchiveEntry[];
};

export type RotationResult = {
  /** rotation 대상 후보 problemId 목록 (dry-run 포함) */
  candidates: string[];
  /** 실제로 이동된 problemId 목록 (apply 시만 채워짐) */
  rotated: string[];
};

export type RotateOptions = {
  /** true이면 파일을 이동하지 않고 후보만 반환 (기본: true) */
  dryRun: boolean;
};

export class RotationEngine {
  constructor(
    private readonly storage: Storage,
    private readonly clock: Clock,
    private readonly problemStore: ActiveProblemStore,
  ) {}

  async rotate(options: RotateOptions = { dryRun: true }): Promise<RotationResult> {
    const allProblems = await this.problemStore.listAll();
    const now = new Date(this.clock.isoNow()).getTime();
    const thresholdMs = GOVERNANCE_CONFIG.ROTATION_DAYS * MS_PER_DAY;

    const candidates: string[] = [];
    for (const problem of allProblems) {
      if (problem.status !== "resolved") continue;
      if (!problem.resolvedAt) continue;
      const resolvedMs = new Date(problem.resolvedAt).getTime();
      if (now - resolvedMs < thresholdMs) continue;
      candidates.push(problem.id);
    }

    if (options.dryRun) {
      return { candidates, rotated: [] };
    }

    const rotated: string[] = [];
    for (const problemId of candidates) {
      await this.rotateProblem(problemId);
      rotated.push(problemId);
    }

    return { candidates, rotated };
  }

  private async rotateProblem(problemId: string): Promise<void> {
    const srcDir = `problems/${problemId}`;
    const dstDir = `.archive/${problemId}`;

    // Copy all files to archive
    const files = await this.storage.listFilesRecursive(srcDir);
    for (const srcPath of files) {
      const content = await this.storage.readText(srcPath);
      if (content === null) continue;
      const relativePath = srcPath.slice(srcDir.length + 1);
      await this.storage.writeRaw(`${dstDir}/${relativePath}`, content);
    }

    // Delete source directory
    await this.storage.deleteDir(srcDir);

    // Update archive index
    await this.updateArchiveIndex(problemId);

    // Update problem status to archived
    await this.problemStore.archiveProblem(problemId);
  }

  private async updateArchiveIndex(problemId: string): Promise<void> {
    const allProblems = await this.problemStore.listAll();
    const problem = allProblems.find((p) => p.id === problemId);

    const existing = await this.storage.readJson<ArchiveIndex>(ARCHIVE_INDEX_PATH);
    const entries: ArchiveEntry[] = existing?.entries ?? [];

    entries.push({
      problemId,
      title: problem?.title ?? "",
      slug: problem?.slug ?? "",
      resolvedAt: problem?.resolvedAt ?? null,
      archivedAt: this.clock.isoNow(),
    });

    const index: ArchiveIndex = {
      version: "archive-index@1.0.0",
      entries,
    };
    await this.storage.writeJsonAtomic(ARCHIVE_INDEX_PATH, index);
  }
}
