---
name: cfgm-process
description: Process pending analysis queue items
---

# Process Pending Queue

View and process pending analysis items:

```bash
bun run bin/cfgm-process.ts list
bun run bin/cfgm-process.ts next
bun run bin/cfgm-process.ts done "<item-id>"
```

Use `list` to see all pending items. Use `next` to view the oldest item. After analyzing an item, mark it done with `done <id>`.

As Claude, your job is to:
1. Read the pending item
2. Determine if it reveals causal information about the active problem
3. If yes, record the insight (Phase 2 will structure this into flow blocks)
4. Mark the item as done
