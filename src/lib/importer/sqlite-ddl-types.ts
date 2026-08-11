export interface SqliteColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dfltValue: string | null;
  pk: number;
  hidden: number;
}

export interface SqliteIndexColumnInfo {
  seqno: number;
  cid: number;
  name: string | null;
}

export interface SqliteIndexInfo {
  name: string;
  isUnique: boolean;
  origin: string;
  partial: boolean;
  columns: SqliteIndexColumnInfo[];
}

export interface SqliteForeignKeyInfo {
  id: number;
  seq: number;
  targetTable: string;
  sourceColumn: string;
  targetColumn: string | null;
  onUpdate: string;
  onDelete: string;
  match: string;
}

export interface SqliteTableInfo {
  name: string;
  sql: string;
  columns: SqliteColumnInfo[];
  indexes: SqliteIndexInfo[];
  foreignKeys: SqliteForeignKeyInfo[];
}

export interface SqliteSchemaInfo {
  tables: SqliteTableInfo[];
}

export interface SqliteWorkerRequest {
  type: "parse";
  ddl: string;
}

export type SqliteWorkerResponse =
  | { type: "success"; schema: SqliteSchemaInfo }
  | { type: "error"; message: string };
