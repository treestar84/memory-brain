---
description: Install this plugin's dependencies (one-time, asks for confirmation)
---

Check whether dependencies are already installed by running `test -d "$CLAUDE_PLUGIN_ROOT/node_modules/yaml" && echo present || echo missing`.

- If `present`, tell the user setup is already done and they can use `/memory-brain:search`, `/memory-brain:ask`, `/memory-brain:doctor`, `/memory-brain:capture`, `/memory-brain:stats` directly — no global PATH command is needed, every command below runs `bin/cfgm.ts` directly via `bun run`.
- If `missing`, explain to the user that you are about to run `bun install` inside the plugin's own directory (`$CLAUDE_PLUGIN_ROOT`) to install this plugin's own declared dependencies (no other side effects, no global command registration). Then run it:

```
cd "$CLAUDE_PLUGIN_ROOT" && bun install
```

Report the actual output (including any errors) back to the user — do not hide or summarize away failures. If it fails, tell the user exactly what failed and suggest they run it manually in a terminal instead.
