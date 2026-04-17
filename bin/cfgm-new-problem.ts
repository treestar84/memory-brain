import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { ActiveProblemStore } from "../src/core/binder/ActiveProblemStore";

const projectRoot = process.env.CFGM_PROJECT_ROOT || process.cwd();
const mbPath = `${projectRoot}/.memory-brain`;

const storage = new FsStorage(mbPath);
const clock = new RealClock();
const store = new ActiveProblemStore(storage, clock);

const [title, slug] = process.argv.slice(2);
if (!title || !slug) {
  console.error("Usage: cfgm-new-problem <title> <slug>");
  process.exit(1);
}

const problem = await store.create(title, slug);
console.log(`Created problem: ${problem.id} (${problem.slug})`);
console.log(`Title: ${problem.title}`);
console.log(`Active: true`);
