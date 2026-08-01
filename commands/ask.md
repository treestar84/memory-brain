---
description: Ask memory-brain a question and get a claim-cited answer
argument-hint: <query>
---

Run `bun run "$CLAUDE_PLUGIN_ROOT/bin/cfgm.ts" ask "$ARGUMENTS"` in the shell. This returns an evidence bundle: top-matching wiki pages, snippets, and their claim ids — it does not generate an answer itself.

Using only the evidence bundle returned by the command (do not use outside knowledge), write an answer to "$ARGUMENTS" that cites the relevant claim ids inline (e.g. `[cl-xxx]`) for every non-trivial statement. If the evidence bundle is empty or insufficient to answer confidently, say so explicitly rather than guessing.

If it fails because `node_modules` is missing, tell the user to run `/memory-brain:setup` once to install dependencies.
