---
description: Enqueue a file or directory of session notes for memory capture
argument-hint: <file-or-dir>
---

Run `bun run "$CLAUDE_PLUGIN_ROOT/bin/cfgm.ts" capture --input "$ARGUMENTS"` in the shell. This enqueues the given file or directory into the capture job queue for later draft extraction — it does not write to memory directly.

Show the user the command's output, including the created job path(s), and explain that drafts still need review/acceptance (`bun run "$CLAUDE_PLUGIN_ROOT/bin/cfgm.ts" capture-status`, `capture-accept`) before they become part of the memory wiki.

If it fails because `node_modules` is missing, tell the user to run `/memory-brain:setup` once to install dependencies.
