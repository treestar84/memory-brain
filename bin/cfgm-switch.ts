import { FsStorage } from "../src/core/storage/FsStorage";
import { RealClock } from "../src/core/clock/Clock";
import { ActiveProblemStore } from "../src/core/binder/ActiveProblemStore";

const projectRoot = process.env.CFGM_PROJECT_ROOT || process.cwd();
const storage = new FsStorage(`${projectRoot}/.memory-brain`);
const store = new ActiveProblemStore(storage, new RealClock());

const [action] = process.argv.slice(2);

if (action === "list") {
  const history = await store.getHistory();
  const active = await store.getActive();
  if (history.length === 0) {
    console.log("No problems found. Use cfgm-new-problem to create one.");
  } else {
    for (const p of history) {
      const marker = p.id === active?.id ? " ← active" : "";
      console.log(`${p.id} | ${p.slug} | ${p.title}${marker}`);
    }
  }
} else if (action) {
  await store.switchTo(action);
  const active = await store.getActive();
  console.log(`Switched to: ${active?.title} (${active?.slug})`);
} else {
  console.error("Usage: cfgm-switch list | <problem-id>");
  process.exit(1);
}
