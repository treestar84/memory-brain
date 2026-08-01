---
description: Search the memory-brain wiki with natural language
argument-hint: <query>
---

Run `bun run "$CLAUDE_PLUGIN_ROOT/bin/cfgm.ts" search "$ARGUMENTS"` in the shell and show the results to the user.

If it fails because `node_modules` is missing, tell the user to run `/memory-brain:setup` once to install dependencies.
