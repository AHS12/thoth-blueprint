import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import type {
  SqliteColumnInfo,
  SqliteForeignKeyInfo,
  SqliteIndexColumnInfo,
  SqliteIndexInfo,
  SqliteSchemaInfo,
  SqliteTableInfo,
  SqliteWorkerRequest,
  SqliteWorkerResponse,
} from "@/lib/importer/sqlite-ddl-types";

let sqlPromise: ReturnType<typeof initSqlJs> | undefined;

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function queryRows<T>(
  db: InstanceType<Awaited<ReturnType<typeof initSqlJs>>["Database"]>,
  sql: string,
  columns: string[],
): T[] {
  const result = db.exec(sql)[0];
  if (!result) return [];

  return result.values.map((values) => {
    const row: Record<string, unknown> = {};
    columns.forEach((column, index) => {
      row[column] = values[index];
    });
    return row as T;
  });
}

function readColumns(
  db: InstanceType<Awaited<ReturnType<typeof initSqlJs>>["Database"]>,
  tableName: string,
): SqliteColumnInfo[] {
  const rows = queryRows<{
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
    pk: number;
    hidden: number;
  }>(db, `PRAGMA table_xinfo(${quoteIdentifier(tableName)})`, [
    "cid",
    "name",
    "type",
    "notnull",
    "dflt_value",
    "pk",
    "hidden",
  ]);

  return rows.map((row) => ({
    cid: Number(row.cid),
    name: String(row.name),
    type: String(row.type ?? ""),
    notnull: Number(row.notnull),
    dfltValue: row.dflt_value === null ? null : String(row.dflt_value),
    pk: Number(row.pk),
    hidden: Number(row.hidden),
  }));
}

function readIndexes(
  db: InstanceType<Awaited<ReturnType<typeof initSqlJs>>["Database"]>,
  tableName: string,
): SqliteIndexInfo[] {
  const rows = queryRows<{
    name: string;
    unique: number;
    origin: string;
    partial: number;
  }>(db, `PRAGMA index_list(${quoteIdentifier(tableName)})`, [
    "seq",
    "name",
    "unique",
    "origin",
    "partial",
  ]);

  return rows.map((row) => {
    const columns = queryRows<{
      seqno: number;
      cid: number;
      name: string | null;
    }>(db, `PRAGMA index_info(${quoteIdentifier(row.name)})`, [
      "seqno",
      "cid",
      "name",
    ]);

    const indexColumns: SqliteIndexColumnInfo[] = columns.map((column) => ({
      seqno: Number(column.seqno),
      cid: Number(column.cid),
      name: column.name === null ? null : String(column.name),
    }));

    return {
      name: String(row.name),
      isUnique: Number(row.unique) === 1,
      origin: String(row.origin ?? "c"),
      partial: Number(row.partial) === 1,
      columns: indexColumns,
    };
  });
}

function readForeignKeys(
  db: InstanceType<Awaited<ReturnType<typeof initSqlJs>>["Database"]>,
  tableName: string,
): SqliteForeignKeyInfo[] {
  const rows = queryRows<{
    id: number;
    seq: number;
    table: string;
    from: string;
    to: string | null;
    on_update: string;
    on_delete: string;
    match: string;
  }>(db, `PRAGMA foreign_key_list(${quoteIdentifier(tableName)})`, [
    "id",
    "seq",
    "table",
    "from",
    "to",
    "on_update",
    "on_delete",
    "match",
  ]);

  return rows.map((row) => ({
    id: Number(row.id),
    seq: Number(row.seq),
    targetTable: String(row.table),
    sourceColumn: String(row.from),
    targetColumn: row.to === null ? null : String(row.to),
    onUpdate: String(row.on_update ?? "NO ACTION"),
    onDelete: String(row.on_delete ?? "NO ACTION"),
    match: String(row.match ?? "NONE"),
  }));
}

function removeInternalSchemaStatements(ddl: string): string {
  // SQLite creates these bookkeeping tables itself. Schema dumps can contain
  // their CREATE statements, which must not be replayed into a new database.
  const internalTablePattern =
    /(^|;)\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(?:main\s*\.\s*)?["`\x5B]?sqlite_[A-Za-z0-9_]*["`\x5D]?)\s*\([^;]*\)\s*;?/gim;
  const internalIndexPattern =
    /(^|;)\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:(?:main\s*\.\s*)?["`\x5B]?sqlite_autoindex_[A-Za-z0-9_]*["`\x5D]?)\s+ON\s+[^;]*;?/gim;
  const preserveSeparator = (_match: string, separator: string) =>
    separator === ";" ? ";" : "";

  return ddl
    .replace(internalTablePattern, preserveSeparator)
    .replace(internalIndexPattern, preserveSeparator);
}

async function parseDdl(ddl: string): Promise<SqliteSchemaInfo> {
  sqlPromise ??= initSqlJs({ locateFile: () => wasmUrl });
  const SQL = await sqlPromise;
  const db = new SQL.Database();

  try {
    db.run(removeInternalSchemaStatements(ddl));
    const tables = queryRows<{ name: string; sql: string | null }>(
      db,
      `SELECT name, sql
       FROM sqlite_schema
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY rowid`,
      ["name", "sql"],
    );

    return {
      tables: tables.map((table): SqliteTableInfo => ({
        name: String(table.name),
        sql: table.sql === null ? "" : String(table.sql),
        columns: readColumns(db, String(table.name)),
        indexes: readIndexes(db, String(table.name)),
        foreignKeys: readForeignKeys(db, String(table.name)),
      })),
    };
  } finally {
    db.close();
  }
}

self.addEventListener(
  "message",
  (event: MessageEvent<SqliteWorkerRequest>) => {
    if (event.data.type !== "parse") return;

    void parseDdl(event.data.ddl)
      .then((schema) => {
        const response: SqliteWorkerResponse = { type: "success", schema };
        self.postMessage(response);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        const response: SqliteWorkerResponse = { type: "error", message };
        self.postMessage(response);
      });
  },
);
