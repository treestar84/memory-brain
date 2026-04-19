# CFGM-OS Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the hook-native ledger MVP — hooks capture raw events to JSONL, maintain active-problem state, normalize observations via deterministic rules, and queue ambiguous items for Claude Code to process.

**Architecture:** 3-layer (Platform Adapter → Core → Storage). Hooks are Bun scripts receiving JSON on stdin, outputting markdown context on stdout. Core is platform-free pure functions with injected Storage interface. All intelligence lives in Claude Code conversation, not in hooks.

**Tech Stack:** Bun 1.x, TypeScript strict, `bun test` for testing, JSONL + JSON for storage, no external dependencies beyond Bun built-ins.

**Spec:** [`docs/superpowers/specs/2026-04-17-cfgm-os-hook-memory-design.md`](../specs/2026-04-17-cfgm-os-hook-memory-design.md)

---

## File Structure

```
memory-brain/
├─ package.json
├─ tsconfig.json
├─ bunfig.toml
├─ .gitignore
├─ README.md
├─ src/
│  ├─ core/
│  │  ├─ events/
│  │  │  ├─ CanonicalEvent.ts       # CanonicalEvent type + stage payloads
│  │  │  └─ guards.ts               # Type guard functions
│  │  ├─ storage/
│  │  │  ├─ Storage.ts              # Storage interface
│  │  │  ├─ FsStorage.ts            # Real filesystem impl
│  │  │  └─ MemoryStorage.ts        # In-memory impl for testing
│  │  ├─ ledger/
│  │  │  ├─ RawLedger.ts            # Append-only JSONL writer
│  │  │  ├─ PendingQueue.ts         # pending-analysis.jsonl manager
│  │  │  └─ Expirer.ts              # 7-day TTL expiration
│  │  ├─ normalizer/
│  │  │  └─ ObservationNormalizer.ts # Deterministic observation extraction
│  │  ├─ binder/
│  │  │  └─ ActiveProblemStore.ts    # active-problem.json R/W
│  │  ├─ security/
│  │  │  ├─ patterns.ts             # Sensitive data regex patterns
│  │  │  └─ Redactor.ts             # Redact + log to security/redacted.jsonl
│  │  └─ clock/
│  │     └─ Clock.ts                # Injectable clock interface
│  ├─ adapters/
│  │  └─ claude-code/
│  │     ├─ mapper.ts               # Claude Code stdin JSON → CanonicalEvent
│  │     ├─ hook-runner.ts          # stdin reader + mapper + core dispatch
│  │     └─ VERSION                  # Supported Claude Code version range
│  └─ hooks/
│     ├─ session-start.ts           # Entry point: SessionStart hook
│     ├─ user-prompt-submit.ts      # Entry point: UserPromptSubmit hook
│     ├─ pre-tool-use.ts            # Entry point: PreToolUse hook
│     ├─ post-tool-use.ts           # Entry point: PostToolUse hook
│     └─ session-end.ts             # Entry point: SessionEnd hook
├─ bin/
│  ├─ install.ts                    # Install hooks into settings.json
│  ├─ uninstall.ts                  # Remove hooks from settings.json
│  ├─ cfgm-new-problem.ts          # CLI: create new problem
│  ├─ cfgm-switch.ts               # CLI: switch active problem
│  ├─ cfgm-process.ts              # CLI: process pending queue
│  └─ cfgm-requeue.ts              # CLI: requeue expired items
├─ skills/
│  ├─ cfgm-new-problem/SKILL.md
│  ├─ cfgm-switch/SKILL.md
│  ├─ cfgm-process/SKILL.md
│  └─ cfgm-requeue/SKILL.md
├─ fixtures/
│  └─ claude-code/
│     └─ v1/
│        ├─ session-start.json
│        ├─ prompt-submit.json
│        ├─ pre-tool-edit.json
│        ├─ pre-tool-bash.json
│        ├─ pre-tool-read.json
│        ├─ post-tool-edit.json
│        ├─ post-tool-bash.json
│        ├─ post-tool-read.json
│        ├─ pre-compact.json
│        └─ session-end.json
├─ templates/
│  └─ project-gitignore.txt
└─ tests/
   ├─ helpers/
   │  ├─ fixture.ts                 # Load fixture JSON by name
   │  └─ tmpenv.ts                  # Create tmpdir with env overrides
   ├─ smoke/
   │  └─ setup.test.ts
   ├─ core/
   │  ├─ storage/
   │  │  └─ storage.contract.test.ts
   │  ├─ events/
   │  │  └─ guards.test.ts
   │  ├─ ledger/
   │  │  ├─ raw-ledger.test.ts
   │  │  ├─ pending-queue.test.ts
   │  │  └─ expirer.test.ts
   │  ├─ normalizer/
   │  │  └─ normalizer.test.ts
   │  ├─ binder/
   │  │  └─ active-problem.test.ts
   │  └─ security/
   │     └─ redactor.test.ts
   ├─ adapters/
   │  └─ claude-code/
   │     └─ mapper.test.ts
   ├─ hooks/
   │  ├─ session-start.test.ts
   │  ├─ user-prompt-submit.test.ts
   │  ├─ pre-tool-use.test.ts
   │  ├─ post-tool-use.test.ts
   │  └─ session-end.test.ts
   ├─ bin/
   │  ├─ install.test.ts
   │  └─ cfgm-cli.test.ts
   └─ e2e/
      └─ phase1-golden-path.test.ts
```

---

The full 18-task implementation plan with complete code follows. Each task has: files, failing test, implementation, verify, commit.

**Task files (split by epic/size):**

| File | Tasks | Content |
|---|---|---|
| [`phase1-tasks-epic0.md`](./2026-04-17-cfgm-os-phase1-tasks-epic0.md) | 1–7 (E0-S1~S7) | Dev Infrastructure: project init, Storage, CanonicalEvent, adapter, install, test harness, .gitignore |
| [`phase1-tasks-epic1-part1.md`](./2026-04-17-cfgm-os-phase1-tasks-epic1-part1.md) | 8–11 (E1-S1~S4) | Core Modules: RawLedger, ActiveProblemStore, ObservationNormalizer, PendingQueue + Expirer |
| [`phase1-tasks-epic1-part2.md`](./2026-04-17-cfgm-os-phase1-tasks-epic1-part2.md) | 12–18 (E1-S5~S11) | Hooks, Skills, E2E: SessionStart/PromptSubmit/PreToolUse/PostToolUse/SessionEnd, CLI tools, E2E golden path |
