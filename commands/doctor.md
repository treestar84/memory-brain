---
description: Run memory-brain's install/environment self-check
---

Run `bun run "$CLAUDE_PLUGIN_ROOT/bin/cfgm.ts" doctor` in the shell and show the results to the user, including any suggested fix commands it reports.

If it fails because `node_modules` is missing, tell the user to run `/memory-brain:setup` once to install dependencies.
