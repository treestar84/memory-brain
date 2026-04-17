---
name: cfgm-new-problem
description: Create a new problem and set it as active
---

# Create New Problem

Run this CLI to create a new problem:

```bash
bun run bin/cfgm-new-problem.ts "<title>" "<slug>"
```

The command creates the problem in `.memory-brain/state/active-problem.json` and sets it as the active problem.

After creating, confirm the problem context to the user and continue working within this problem scope.
