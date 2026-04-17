---
name: cfgm-requeue
description: Requeue expired analysis items back to pending
---

# Requeue Expired Items

Move expired items back to the pending queue:

```bash
bun run bin/cfgm-requeue.ts list
bun run bin/cfgm-requeue.ts all
bun run bin/cfgm-requeue.ts "<item-id>"
```

Use this when expired items are still relevant and need re-analysis.
