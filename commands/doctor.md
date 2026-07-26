---
description: Run memory-brain's install/environment self-check
---

Run `cfgm doctor` in the shell and show the results to the user, including any suggested fix commands it reports.

If the command fails with `cfgm: command not found`, tell the user the plugin is still provisioning — ask them to start a new session, or run `cd <plugin dir> && bun install && bun link` manually.
