---
description: memory-brain bootloader — 메모리 사용 규칙 + Bun 정책
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json, *.md"
alwaysApply: true
---

# memory-brain Bootloader

> 비전 §5.1 답습 (PR-V3.2). 본 파일은 **memory bootloader** — 전체 메모리를 읽지 말고 다음 규칙만 따라라.

## 메모리 사용 규칙

1. **전체 메모리 읽지 말 것**. 요청을 받으면 먼저 `memory/ROUTER.md` 의 retrieval policy 만 본다.
2. **ROUTER.md 위치**: `memory/ROUTER.md` (repo 루트 기준).
3. **source/evidence 우선**: claim 답변 시 evidence pointer 인용 의무. evidence 없는 high-confidence claim 금지.
4. **persona ≠ fact**: `memory/profile/representations.jsonl` 의 inferred profile은 confidence 표기 의무. 사용자 반박 시 즉시 수정.
5. **routing policy 따르라**: ROUTER.md §라우팅 제한 — canonical page 동시 ≤ 3, source는 검증 필요 시만.
6. **append-only + projection**: 모든 ledger는 새 엔트리 + last-wins reduce. 직접 수정 금지.

## 디렉토리 진입점

- `memory/ROUTER.md` — retrieval policy (지식 목록 X, 정책만)
- `memory/current.md` — 현재 작업 컨텍스트 표면 (1쪽)
- `memory/SCHEMA.md` — 디렉토리 트리 명세
- `docs/adr/` — Architecture Decision Records (코드 결정)

## 7-layer 빠른 참조

| Layer | 위치 | 역할 |
|---|---|---|
| L1 Bootloader | 본 파일 + `MEMORY.md` | 메모리 사용 규칙 |
| L2 Router | `memory/ROUTER.md` | retrieval policy |
| L3 Wiki | `memory/{sources,projects,concepts,decisions}/` | canonical knowledge (PR-V3.4) |
| L4 Claim | `.memory-brain/claims/ledger.jsonl` (PR-V3.5에서 `memory/claims/` 이관) | claim/evidence 원장 |
| L5 Graph/Search | `memory/indexes/` (PR-V3.6) | derived index (rebuild 가능) |
| L6 Persona | `.memory-brain/memory/profile/*.jsonl` | PersonaStore (peers/sessions/messages/representations) |
| L7 Governance | `memory/reports/` (PR-V3.7) | duplicate / stale / contradiction / decay |

## 본 프로젝트의 절대 규칙

- `CLAUDE.md` / `MEMORY.md` 에 **모든 지식을 넣지 말 것** — bootloader만.
- `ROUTER.md` 에 **모든 topic 목록을 넣지 말 것** — 정책만.
- `inference` 를 **검증된 fact 로 저장하지 말 것** — confidence + evidence pointer 의무.
- 중복 발견 시 **무조건 append 하지 말 것** — upsert/merge/supersede.
- 오래된 정보를 **삭제만으로 처리하지 말 것** — supersede / decay / archive 우선.

---

# Bun 정책 (코드 작성 시)

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";

// import .css files directly and it works
import './index.css';

import { createRoot } from "react-dom/client";

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.md`.
