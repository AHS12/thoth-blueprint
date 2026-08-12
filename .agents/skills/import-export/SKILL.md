---
name: import-export
description: Change SQL, SQLite worker, DBML, JSON, Mermaid, SVG, or database export/import flows while preserving diagram semantics and round trips. Use when adding dialect support or changing parser/exporter behavior.
---

# Import and Export

## Read First

- `src/components/ImportDialog.tsx` and `src/components/ExportDialog.tsx` for UI dispatch.
- `src/lib/importer.ts` and `src/lib/importer/` for parser contracts.
- `src/workers/sqlite-ddl.worker.ts` for SQLite worker boundaries.
- `src/lib/exporter/`, `src/lib/mermaid.ts`, and `src/lib/types.ts` for output and model semantics.

## Change Rules

1. Select the parser from the declared database dialect and keep progress/diagnostic behavior intact.
2. Preserve table and column IDs, positions, colors, locks, notes, zones, viewport, and relationship metadata when the format supports them.
3. Treat custom SQL parsers as dialect-specific state machines. Do not assume MySQL, PostgreSQL, and SQLite syntax coverage is interchangeable.
4. Keep SQLite parsing in the worker and handle worker errors without leaving a half-imported diagram.
5. JSON imports require safe validation before entering the store. Never trust arbitrary node, edge, or date data merely because the top-level arrays exist.
6. DBML save synchronization uses heuristic matching; test similarly named and structurally similar tables, IDs, positions, and repeated save cycles.
7. Generated SQL, DBML, Mermaid, SVG, and migrations are output artifacts. Review quoting, composite keys, comments, notes/zones, and unsupported features explicitly.

## Verification Matrix

- Import valid and invalid MySQL, PostgreSQL, SQLite, DBML, and application JSON.
- Export and re-import each supported round-trip format where applicable.
- Include composite relationships, indexes, comments, nullable/default/generated columns, notes, zones, and locked diagrams when relevant.
- Confirm diagnostics are visible and failures do not mutate the active diagram.
