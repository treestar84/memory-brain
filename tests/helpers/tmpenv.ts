import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MemoryStorage } from "../../src/core/storage/MemoryStorage";
import { FsStorage } from "../../src/core/storage/FsStorage";
import { FakeClock } from "../../src/core/clock/Clock";
import type { Storage } from "../../src/core/storage/Storage";

export type TestEnv = {
  storage: Storage;
  clock: FakeClock;
  cfgmHome: string;
  projectHome: string;
  cleanup: () => Promise<void>;
};

export async function createTmpEnv(opts?: { useFs?: boolean }): Promise<TestEnv> {
  const tmpRoot = await mkdtemp(join(tmpdir(), "cfgm-env-"));
  const cfgmHome = join(tmpRoot, ".memory-brain");
  const projectHome = join(tmpRoot, "project", ".memory-brain");

  await mkdir(cfgmHome, { recursive: true });
  await mkdir(projectHome, { recursive: true });

  const storage = opts?.useFs
    ? new FsStorage(projectHome)
    : new MemoryStorage();

  return {
    storage,
    clock: new FakeClock(),
    cfgmHome,
    projectHome,
    cleanup: () => rm(tmpRoot, { recursive: true, force: true }),
  };
}
