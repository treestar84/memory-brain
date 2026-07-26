---
description: Provision the global `cfgm` command for this plugin (one-time, asks for confirmation)
---

Check whether `cfgm` is already on PATH by running `command -v cfgm`.

- If it is already present, tell the user setup is already done and they can use `/memory-brain:search`, `/memory-brain:ask`, `/memory-brain:doctor`, `/memory-brain:capture`, `/memory-brain:stats` directly.
- If it is not present, explain to the user that you are about to run `bun install && bun link` inside the plugin's own directory (`$CLAUDE_PLUGIN_ROOT`) to register the `cfgm` command globally, and that this only installs this plugin's own declared dependencies (no other side effects). Then run it as two explicit shell commands so the user sees the real output of each step:

```
cd "$CLAUDE_PLUGIN_ROOT" && bun install
cd "$CLAUDE_PLUGIN_ROOT" && bun link
```

Report the actual output (including any errors) back to the user — do not hide or summarize away failures. If either step fails, tell the user exactly what failed and suggest they run it manually in a terminal instead.
