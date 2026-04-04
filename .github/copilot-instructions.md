# Project Guidelines

## Code Style

- Use TypeScript with strict typing; avoid `any` unless there is a clear constraint.
- Use the `@/` import alias for source imports.
- Keep app routes centralized in `src/App.tsx`.
- Prefer existing shadcn and Radix-based UI components; do not edit generated UI primitives directly.

## Architecture

- This is a browser-based, offline-first React + Vite app (not a Next.js app).
- Persist user/project data in IndexedDB via Dexie (`src/lib/db.ts`); avoid server assumptions for core editor flows.
- Keep source under `src/` with existing boundaries:
  - `src/components`: UI/editor components.
  - `src/store`: Zustand state orchestration.
  - `src/lib`: data logic (Dexie, import/export, parsing, utilities).
  - `src/pages`: route views.
- Maintain PWA/offline behavior when changing build/runtime config; see `vite.config.ts` and PWA components.

## Build And Verification

- Install: `pnpm install`
- Dev server: `pnpm dev`
- Lint: `pnpm lint`
- Type-check: `pnpm type-check`
- Production build (runs type-check + lint first): `pnpm build`
- Preview build: `pnpm preview`
- There is currently no configured test runner command in `package.json`; do not assume `pnpm test` is available.

## Conventions

- Offline-first is a product requirement: keep critical flows functional without network access.
- When adding persisted diagram fields, add a Dexie schema migration in `src/lib/db.ts`.
- Keep new visible UI integrated into the main page flow (see `src/pages/Index.tsx`).
- Follow existing patterns before introducing new abstractions; use representative files as references:
  - `src/store/store.ts`
  - `src/components/DiagramEditor.tsx`
  - `src/lib/importer/mysql-ddl-parser.ts`

## Documentation Links

- Product/dev setup: `README.md`
- Contribution workflow: `CONTRIBUTING.md`
- Stack/layout rules: `AI_RULES.md`
- Versioning process: `docs/VERSIONING.md`
