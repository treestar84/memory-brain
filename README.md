# CFGM-OS (Causal Flow Gap Memory Operating System)

Hook-based self-forming ontology memory system for Claude Code.

## Quick Start

```bash
bun install
bun run bin/install.ts
```

## Uninstall

```bash
bun run bin/uninstall.ts
```

## Test

```bash
bun test
```

## Architecture

3-layer: Platform Adapter → Core → Storage

- **Adapters** (`src/adapters/`): Platform-specific JSON → CanonicalEvent
- **Core** (`src/core/`): Platform-free pure functions
- **Storage** (`src/core/storage/`): Injectable interface (Fs / Memory)

## Storage Paths

- User-level: `~/.memory-brain/`
- Project-level: `$PROJECT/.memory-brain/`
