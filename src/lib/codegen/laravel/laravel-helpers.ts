// Laravel-specific helper functions for migration generation

export function toLaravelTableName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export function toLaravelClassName(tableName: string): string {
  return `Create${toPascalCase(tableName)}Table`;
}

export function toPascalCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""))
    .replace(/^(.)/, (_, c) => c.toUpperCase());
}

export function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");
}

export function generateTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  const second = String(now.getSeconds()).padStart(2, "0");

  return `${year}_${month}_${day}_${hour}${minute}${second}`;
}

export function escapeString(str: string): string {
  return str.replace(/'/g, "\\'").replace(/\n/g, "\\n").replace(/\r/g, "\\r");
}

export function isLaravelTimestampColumn(columnName: string): boolean {
  const name = columnName.toLowerCase();
  return ["created_at", "updated_at", "deleted_at"].includes(name);
}

export function isLaravelIdColumn(columnName: string): boolean {
  return (
    columnName.toLowerCase().endsWith("_id") ||
    columnName.toLowerCase() === "id"
  );
}

export function getLaravelColumnType(type: string, columnName: string): string {
  const upperType = type.toUpperCase();
  const lowerName = columnName.toLowerCase();

  // Handle Laravel conventions
  if (
    lowerName.endsWith("_id") &&
    ["INT", "INTEGER", "BIGINT"].includes(upperType)
  ) {
    return "unsignedBigInteger";
  }

  if (lowerName === "email") {
    return "string";
  }

  if (lowerName === "password") {
    return "string";
  }

  if (lowerName.includes("phone")) {
    return "string";
  }

  // Standard type mappings
  switch (upperType) {
    case "VARCHAR":
      return "string";
    case "CHAR":
      return "char";
    case "TEXT":
      return "text";
    case "CLOB":
      return "text";
    case "LONGTEXT":
      return "longText";
    case "MEDIUMTEXT":
      return "mediumText";
    case "TINYTEXT":
      return "text";
    case "INT":
    case "INTEGER":
      return "integer";
    case "BIGINT":
      return "bigInteger";
    case "SMALLINT":
      return "smallInteger";
    case "TINYINT":
      return "boolean";
    case "DECIMAL":
    case "NUMERIC":
      return "decimal";
    case "FLOAT":
      return "float";
    case "DOUBLE":
    case "DOUBLE PRECISION":
      return "double";
    case "BOOLEAN":
    case "BOOL":
      return "boolean";
    case "DATE":
      return "date";
    case "DATETIME":
      return "dateTime";
    case "TIMESTAMP":
      return "timestamp";
    case "TIME":
      return "time";
    case "JSON":
      return "json";
    case "ENUM":
      return "enum";
    case "SET":
      return "set";
    case "BINARY":
    case "LONGBLOB":
    case "BLOB":
      return "binary";
    case "UUID":
      return "uuid";
    case "YEAR":
      return "year";
    default:
      return "string";
  }
}
