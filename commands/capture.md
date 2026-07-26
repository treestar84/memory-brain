---
description: Enqueue a file or directory of session notes for memory capture
argument-hint: <file-or-dir>
---

Run `cfgm capture --input "$ARGUMENTS"` in the shell. This enqueues the given file or directory into the capture job queue for later draft extraction — it does not write to memory directly.

Show the user the command's output, including the created job path(s), and explain that drafts still need review/acceptance (`cfgm capture-status`, `cfgm capture-accept`) before they become part of the memory wiki.

If the command fails with `cfgm: command not found`, tell the user the plugin is still provisioning — ask them to start a new session, or run `cd <plugin dir> && bun install && bun link` manually.
