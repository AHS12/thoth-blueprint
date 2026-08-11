---
name: migration-codegen
description: Change Laravel, TypeORM, or Django migration generation and generated SQL parsing. Use when modifying framework code generation, foreign keys, indexes, naming, or migration artifacts.
---

# Migration Code Generation

## Read First

- `src/lib/codegen/` and its Laravel, TypeORM, and Django generators.
- `src/lib/exporter/` for dialect-specific SQL generation.
- `src/lib/types.ts` for columns, indexes, and edge metadata.
- `src/lib/utils.ts` for IDs and relationship helpers.

## Change Rules

1. Keep framework conventions explicit: Laravel timestamps and inferred foreign-key names, TypeORM's SQL parsing assumptions, and Django's `yourapp` placeholder.
2. Validate identifier quoting, nullable/default/generated columns, indexes, composite foreign keys, on-delete/on-update behavior, and table ordering.
3. Do not assume generated SQL has one formatting shape. If a generator parses SQL, keep the parser tolerant of the SQL it emits and test alterations as well as creates.
4. Preserve hyphenated IDs when resolving handles and columns. Never use `split("-")[0]` as a column-ID parser.
5. Treat output as a candidate artifact. Do not claim a migration is executable without reviewing or executing it against the target framework/database.

## Verification

- Generate artifacts for empty, single-table, indexed, related, composite-key, and altered schemas.
- Inspect generated files for valid syntax, deterministic naming, and correct foreign-key direction.
- Exercise each supported database type where the generator accepts it.
- Run type-check, lint, and build; manually review generated output because no generated SQL test runner is configured.
