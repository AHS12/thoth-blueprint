---
name: diagram-editor
description: Safely change the React Flow database diagram editor, including table, note, zone, relationship, selection, locking, layout, keyboard, and viewport behavior. Use when changing editor components or diagram mutations.
---

# Diagram Editor

## Read First

- `src/lib/types.ts` for node, edge, column, and relationship data shapes.
- `src/store/store.ts` for the mutation API and persistence-facing state transitions.
- `src/components/DiagramEditor.tsx` for React Flow wiring and interaction patterns.
- `src/lib/utils.ts` for ID, handle, position, lock, and relationship helpers.

## Change Rules

1. Use store actions such as `addNode`, `updateNode`, `deleteNodes`, `addEdge`, `updateEdge`, `deleteEdge`, `onNodesChange`, and `onEdgesChange` instead of mutating diagram arrays in a component.
2. Keep table IDs and column IDs stable. Handles usually encode a column ID plus a side suffix such as `${columnId}-right-source` or `${columnId}-left-target`; never parse these with a naive `split("-")` because IDs contain hyphens.
3. Treat nodes, notes, zones, and edges as distinct data types. A table soft-delete is not equivalent to removing a note or zone.
4. Preserve `sourceColumns`, `targetColumns`, `isComposite`, constraint metadata, and custom edge positions when updating relationships.
5. Check diagram lock, zone lock, and position-lock behavior on every new mutation entry point, not only the visible toolbar action.
6. When using React Flow's `setNodes` or `setEdges`, verify the resulting change is forwarded to Zustand and survives the debounced IndexedDB save.
7. Preserve selection, clipboard, viewport, keyboard shortcut, and responsive canvas behavior.

## Verification

- Type-check and lint after edits.
- Exercise create, edit, move, delete, restore, copy/paste, lock/unlock, relationship editing, and viewport persistence when relevant.
- For edge or handle changes, test simple and composite foreign keys and refresh the page before declaring persistence correct.
