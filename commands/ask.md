---
description: Ask memory-brain a question and get a claim-cited answer
argument-hint: <query>
---

Run `cfgm ask "$ARGUMENTS"` in the shell. This returns an evidence bundle: top-matching wiki pages, snippets, and their claim ids — it does not generate an answer itself.

Using only the evidence bundle returned by the command (do not use outside knowledge), write an answer to "$ARGUMENTS" that cites the relevant claim ids inline (e.g. `[cl-xxx]`) for every non-trivial statement. If the evidence bundle is empty or insufficient to answer confidently, say so explicitly rather than guessing.

If the command fails with `cfgm: command not found`, tell the user to run `/memory-brain:setup` once to provision it.
