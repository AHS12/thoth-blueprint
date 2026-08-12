import { DatabaseType } from "./types";

export const postgresDataTypes = [
  // Numeric Types
  "BIGINT", "BIGSERIAL", "DECIMAL", "DOUBLE PRECISION", "INTEGER", "MONEY", "REAL", "SMALLINT", "SERIAL", "SMALLSERIAL",
  // Character Types
  "CHAR", "VARCHAR", "TEXT",
  // Binary Types
  "BYTEA",
  // Date/Time Types
  "DATE", "INTERVAL", "TIME", "TIMETZ", "TIMESTAMP", "TIMESTAMPTZ",
  // Boolean Type
  "BOOLEAN",
  // Enum Type
  "ENUM",
  // Geometric Types
  "BOX", "CIRCLE", "LINE", "LSEG", "PATH", "POINT", "POLYGON",
  // Network Address Types
  "CIDR", "INET", "MACADDR", "MACADDR8",
  // Bit String Types
  "BIT", "BIT VARYING",
  // Text Search Types
  "TSQUERY", "TSVECTOR",
  // UUID Type
  "UUID",
  // XML Type
  "XML",
  // JSON Types
  "JSON", "JSONB",
  // Range Types
  "DATERANGE", "INT4RANGE", "INT8RANGE", "NUMRANGE", "TSRANGE", "TSTZRANGE",
];

export const mysqlDataTypes = [
  // Numeric Types
  "TINYINT", "SMALLINT", "MEDIUMINT", "INT", "BIGINT", "DECIMAL", "FLOAT", "DOUBLE", "BIT",
  // String Types
  "CHAR", "VARCHAR", "BINARY", "VARBINARY", "TINYBLOB", "BLOB", "MEDIUMBLOB", "LONGBLOB", "TINYTEXT", "TEXT", "MEDIUMTEXT", "LONGTEXT", "ENUM", "SET",
  // Date and Time Types
  "DATE", "TIME", "DATETIME", "TIMESTAMP", "YEAR",
  // JSON Type
  "JSON",
  // Spatial Types
  "GEOMETRY", "POINT", "LINESTRING", "POLYGON", "MULTIPOINT", "MULTILINESTRING", "MULTIPOLYGON", "GEOMETRYCOLLECTION",
];

export const sqliteDataTypes = [
  // SQLite accepts arbitrary declared type names, but these are the common
  // names users encounter in SQLite schemas and the editor can suggest.
  "INTEGER", "INT", "BIGINT", "SMALLINT", "TINYINT",
  "REAL", "DOUBLE", "DOUBLE PRECISION", "FLOAT",
  "NUMERIC", "DECIMAL", "BOOLEAN",
  "TEXT", "CHAR", "VARCHAR", "CLOB", "BLOB",
  "DATE", "DATETIME", "JSON",
];

export const dataTypes: Record<DatabaseType, string[]> = {
  postgres: postgresDataTypes,
  mysql: mysqlDataTypes,
  sqlite: sqliteDataTypes,
};

// Display names for supported database types
export const dbTypeDisplay: Record<DatabaseType, string> = {
  postgres: "PostgreSQL",
  mysql: "MySQL",
  sqlite: "SQLite",
};
