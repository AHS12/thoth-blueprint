# What’s New in ThothBlueprint v0.0.9

This release focuses on onboarding experience, in-app guidance, and editor responsiveness improvements for larger diagrams.

## Highlights

- **Guided Onboarding Tour:** Added a reusable product tour for both Gallery and Editor with contextual steps and spotlight guidance.
- **Help Center:** Introduced a dedicated Help Center dialog with quick access to tour, shortcuts, and release notes.
- **Performance Pass:** Improved editor responsiveness by reducing heavy comparisons and tightening update paths in critical interaction flows.

## New & Improved

- **Context-Aware Guided Experience:** Tour tracking is now stored per context (Gallery vs Editor), so each area can be introduced independently.
- **Tour + What’s New Orchestration:** First-time flow now avoids overlap by sequencing guided experience and release notes more cleanly.
- **Responsive Tour Layout:** Improved positioning and compact behavior for mobile/tablet to keep controls readable on smaller screens.
- **Table Copy UX:** Added copy actions in table menus (including the 3-dot menu) with improved popover behavior after copy.
- **Clipboard Indicator:** Added a visible copied-items indicator in the editor so paste readiness is always clear.
- **Edge Interaction Reliability:** Improved edge selection handling so relationship interactions are more consistent.

## Performance & Stability

- Removed expensive deep stringification from hot React memo comparison paths in key editor components.
- Optimized paste flow to use an atomic state update and improved node ID generation reliability.
- Fixed store consistency by ensuring diagram map synchronization across diagram mutation actions.
- Reduced callback/dependency churn in editor interaction handlers to avoid avoidable rerenders.

## Bug Fixes

- Fixed touch interaction regression where tables, notes, and zones could not be dragged/moved properly on mobile/tablet devices ([Issue #32](https://github.com/AHS12/thoth-blueprint/issues/32)).

## Notes

- This section reflects features delivered so far in `v0.0.9` and may be expanded before final release.

---

# What’s New in ThothBlueprint v0.0.8

This release focuses on improving relationship lines, offering manual layout adjustments, and fixing issues with duplicate relationships in complex diagrams.

## Highlights

- **Manual Adjustment of Relationship Lines:** You can now manually adjust the path of relationship lines to untangle complex diagrams and improve readability.
- **Duplicate Relationship Prevention:** Added validation to prevent the creation of duplicate relationships between table fields.

## New & Improved

- **Draggable Relationship Handles:** Selected edges now feature draggable handles, allowing for interactive position adjustments.
- **Reset Manual Adjustments:** Added a reset button in the inspector panel to quickly clear any manual position adjustments and revert to auto-routing.
- **Improved Edge Routing:** Edge path calculations now intelligently use your manual center points when available.
- **Duplicate Detection:** The diagram editor now detects both same-direction and reverse-direction duplicate connections by comparing source/target nodes and column handles.

## Bug Fixes

- Fixed an issue where duplicate relationships between tables could still be created by dragging connection points (Issue #37).

---

# What’s New in ThothBlueprint v0.0.7

This release brings major importer upgrades, MySQL PostgreSQL schema dump importer support, UI improvements, and performance optimizations tailored for large real‑world schemas.

## Highlights

- DBML import support with full enum/SET type resolution and table notes.
- MySQL and PostgreSQL DDL import with asynchronous parsing and progress reporting.
- Gallery pagination (10 per page) with simple previous/next controls.
- Card‑based database selection in Create Diagram.
- Improved Import Dialog validation and database icons.
- Duplicate column feature added. easily duplicate columns with a single click.
- Manual pan support: toggle free panning or hold Space to pan.
- Export foreign key constraint option: choose whether FKs are included in exports.

## New & Improved

- DBML Import: import DBML (Database Markup Language) files to generate diagrams with full support for enums, SET types, table notes, indexes, and relationships.
- MySQL and PostgreSQL DDL Import (8bee30f): import SQL DDL files/scripts to generate diagrams.
- Enhanced MySQL/PostgreSQL Parser (b972563): async parsing, composite foreign keys, extra column attributes, better syntax coverage, diagnostics for warnings/errors, and visible progress in ImportDialog.
- Gallery Sort & Search (dba6ee9): quickly locate diagrams with A–Z sorting and a search bar.
- Pagination (a518c78): display 10 items per page with previous/next.
- Create Diagram UI (a518c78): replace dropdown with database icon cards (MySQL, PostgreSQL; SQL Server, SQLite coming soon).
- Import Dialog UX (e93e023, a518c78): database icons, clearer validation, and progress updates.
- Relationship‑Based Layout (6f41ce4): auto‑organize tables by foreign‑key relationships.
- Zone‑Aware Reorganization (7e1ad2f): lock zones, warn before reorganizing, and respect locked areas.
- Duplicate Diagram (d300ad1): duplicate existing diagrams with unique IDs.
- Table Overlap Option (b9aa3e4): allow overlap during creation when compactness is desired.
- What’s New Dialog (25904e7): in‑app release notes with Markdown.
- Manual Pan Support: enable/disable free panning from View/Controls; when disabled, hold Space to pan. Shortcuts dialog updated.
- Export Foreign Key Constraint: global setting to include/exclude foreign keys in DBML/SQL export and code generation (Laravel, TypeORM, Django).

## Performance & Stability

- Big‑diagram rendering improvements (854e8dc).
- Faster lookups via Maps and component memoization (8c83951).
- Refactored diagram state management for consistency (44b2b80).
- Better importer logic for long scripts (b7af309).
- PostgreSQL enum handling fix for schema‑qualified types (04a0663).

## Tips

- Use search/sort and pagination to navigate large galleries.
- For DBML, export from dbdiagram.io or this app or use the `@dbml/cli` package to convert SQL to DBML.
- For MySQL, export schema via `mysqldump --no-data`; for PostgreSQL, use `pg_dump -s`.
- Lock zones before reorganizing to protect critical areas.

Thanks for using ThothBlueprint!
