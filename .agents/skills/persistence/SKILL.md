---
name: persistence
description: Safely change browser-local persistence, Dexie schemas, store synchronization, backups, trash, restore, or checkpoints. Use when diagram data or IndexedDB behavior changes.
---

# Persistence

## Read First

- `src/lib/db.ts` for the current Dexie version and upgrade history.
- `src/store/store.ts` for debounced position/full saves and state initialization.
- `src/lib/backup.ts` for `.thot` export/import behavior.
- `src/lib/types.ts` for persisted shapes.

## Change Rules

1. Treat `src/lib/db.ts` as an append-only schema history. Add a new `version()` for persisted schema/index changes; do not rewrite old migrations.
2. Add upgrade logic for old records when a new required field cannot be safely defaulted at read time.
3. Preserve existing debounce and transaction behavior. Account for the fact that an immediate IndexedDB read after a mutation can observe the previous value.
4. Check all lifecycle paths for changed fields: create, import, duplicate, trash, restore, permanent delete, checkpoint, backup export, and backup import.
5. Keep `diagrams` and `diagramsMap` synchronized in Zustand. Avoid direct partial state updates that leave the map stale.
6. If a change affects backups, update validation and date rehydration deliberately. Backups currently cover diagrams, selected diagram state, and AI chat sessions, not every local table.
7. Use Dexie transactions for multi-table replacement or clear-and-restore operations.

## Verification

- Test a fresh database and representative existing records when adding a migration.
- Verify reload persistence after normal edits, position-only edits, imports, restores, and deletion.
- Check backup round trips and confirm invalid backup input does not partially replace local data.
- Run `pnpm run type-check`, `pnpm run lint`, and `pnpm run build`.
