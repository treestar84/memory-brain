---
name: cfgm-switch
description: Switch the active problem to a different one
---

# Switch Active Problem

List available problems and switch:

```bash
bun run bin/cfgm-switch.ts list
bun run bin/cfgm-switch.ts "<problem-id>"
```

After switching, summarize the new active problem context.
