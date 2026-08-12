import { type Column, type DatabaseType } from "@/lib/types";

export function toDjangoTableName(tableName: string): string {
  return tableName.toLowerCase().replace(/[^a-z0-9_]/g, "_");
}

export function toDjangoModelName(tableName: string): string {
  return tableName
    .split(/[^a-zA-Z0-9]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

export function generateTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[-:.]/g, "").slice(0, 14);
}

export function escapeString(str: string): string {
  return str.replace(/'/g, "\\'").replace(/\n/g, "\\n");
}

const MYSQL_TO_DJANGO: Record<string, string> = {
  INT: "models.IntegerField",
  INTEGER: "models.IntegerField",
  BIGINT: "models.BigIntegerField",
  SMALLINT: "models.SmallIntegerField",
  TINYINT: "models.SmallIntegerField",
  MEDIUMINT: "models.IntegerField",
  VARCHAR: "models.CharField",
  CHAR: "models.CharField",
  TEXT: "models.TextField",
  LONGTEXT: "models.TextField",
  MEDIUMTEXT: "models.TextField",
  TINYTEXT: "models.TextField",
  DECIMAL: "models.DecimalField",
  NUMERIC: "models.DecimalField",
  FLOAT: "models.FloatField",
  DOUBLE: "models.FloatField",
  REAL: "models.FloatField",
  BOOLEAN: "models.BooleanField",
  BOOL: "models.BooleanField",
  DATE: "models.DateField",
  TIME: "models.TimeField",
  DATETIME: "models.DateTimeField",
  TIMESTAMP: "models.DateTimeField",
  JSON: "models.JSONField",
  ENUM: "models.CharField",
  SET: "models.CharField",
  UUID: "models.UUIDField",
  BINARY: "models.BinaryField",
  VARBINARY: "models.BinaryField",
  BLOB: "models.BinaryField",
};

const POSTGRES_TO_DJANGO: Record<string, string> = {
  INTEGER: "models.IntegerField",
  INT: "models.IntegerField",
  INT4: "models.IntegerField",
  BIGINT: "models.BigIntegerField",
  INT8: "models.BigIntegerField",
  SMALLINT: "models.SmallIntegerField",
  INT2: "models.SmallIntegerField",
  VARCHAR: "models.CharField",
  "CHARACTER VARYING": "models.CharField",
  CHAR: "models.CharField",
  CHARACTER: "models.CharField",
  TEXT: "models.TextField",
  DECIMAL: "models.DecimalField",
  NUMERIC: "models.DecimalField",
  REAL: "models.FloatField",
  FLOAT4: "models.FloatField",
  "DOUBLE PRECISION": "models.FloatField",
  FLOAT8: "models.FloatField",
  BOOLEAN: "models.BooleanField",
  BOOL: "models.BooleanField",
  DATE: "models.DateField",
  TIME: "models.TimeField",
  TIMESTAMP: "models.DateTimeField",
  TIMESTAMPTZ: "models.DateTimeField",
  JSON: "models.JSONField",
  JSONB: "models.JSONField",
  UUID: "models.UUIDField",
  BYTEA: "models.BinaryField",
  SERIAL: "models.AutoField",
  BIGSERIAL: "models.BigAutoField",
  SMALLSERIAL: "models.SmallAutoField",
};

const SQLITE_TO_DJANGO: Record<string, string> = {
  INTEGER: "models.IntegerField",
  INT: "models.IntegerField",
  BIGINT: "models.BigIntegerField",
  SMALLINT: "models.SmallIntegerField",
  TINYINT: "models.SmallIntegerField",
  REAL: "models.FloatField",
  DOUBLE: "models.FloatField",
  "DOUBLE PRECISION": "models.FloatField",
  FLOAT: "models.FloatField",
  NUMERIC: "models.DecimalField",
  DECIMAL: "models.DecimalField",
  BOOLEAN: "models.BooleanField",
  TEXT: "models.TextField",
  CHAR: "models.CharField",
  VARCHAR: "models.CharField",
  CLOB: "models.TextField",
  BLOB: "models.BinaryField",
  DATE: "models.DateField",
  DATETIME: "models.DateTimeField",
  JSON: "models.JSONField",
};

export function getDjangoFieldType(
  col: Column,
  dbType: DatabaseType
): string {
  const type = col.type.toUpperCase();

  if (col.pk && col.isAutoIncrement) {
    if (type.includes("BIGINT") || type.includes("BIGSERIAL"))
      return "models.BigAutoField";
    if (type.includes("SMALLINT") || type.includes("SMALLSERIAL"))
      return "models.SmallAutoField";
    return "models.AutoField";
  }

  const mapping =
    dbType === "postgres"
      ? POSTGRES_TO_DJANGO
      : dbType === "sqlite"
        ? SQLITE_TO_DJANGO
        : MYSQL_TO_DJANGO;
  const baseType = type?.split("(")[0]?.trim() || "";
  return mapping[baseType] || "models.TextField";
}

export function getDjangoFieldOptions(
  col: Column,
  fieldType: string
): string[] {
  const options: string[] = [];
  const type = col.type.toUpperCase();

  if (col.pk) {
    options.push("primary_key=True");
    if (!col.isAutoIncrement) {
      options.push("serialize=False");
    } else {
      options.push("auto_created=True", "serialize=False", "verbose_name='ID'");
    }
  }

  if (fieldType === "models.CharField") {
    const length = col.length || 255;
    options.push(`max_length=${length}`);
  }

  if (fieldType === "models.DecimalField") {
    options.push(`max_digits=${col.precision || 10}`);
    options.push(`decimal_places=${col.scale || 2}`);
  }

  if (col.nullable) {
    options.push("null=True");
    if (fieldType === "models.CharField" || fieldType === "models.TextField") {
      options.push("blank=True");
    }
  }

  if (col.isUnique && !col.pk) {
    options.push("unique=True");
  }

  if (
    col.defaultValue !== undefined &&
    col.defaultValue !== null &&
    String(col.defaultValue).trim() !== ""
  ) {
    const val = col.defaultValue;
    if (typeof val === "string") {
      options.push(`default='${escapeString(val)}'`);
    } else if (typeof val === "boolean") {
      options.push(`default=${val ? "True" : "False"}`);
    } else {
      options.push(`default=${val}`);
    }
  }

  if (col.comment) {
    options.push(`help_text='${escapeString(col.comment)}'`);
  }

  if (type === "ENUM" && col.enumValues) {
    const choices = col.enumValues
      .split(",")
      .map((v) => v.trim())
      .map(
        (v) =>
          `('${v}', '${v.charAt(0).toUpperCase() + v.slice(1).toLowerCase()}')`
      )
      .join(", ");
    options.push(`choices=[${choices}]`);
  }

  return options;
}

export function getDjangoOnDeleteAction(relationship?: string): string {
  switch (relationship?.toUpperCase()) {
    case "CASCADE":
      return "django.db.models.deletion.CASCADE";
    case "SET NULL":
      return "django.db.models.deletion.SET_NULL";
    case "RESTRICT":
    case "NO ACTION":
    case "PROTECT":
      return "django.db.models.deletion.PROTECT";
    case "SET DEFAULT":
      return "django.db.models.deletion.SET_DEFAULT";
    default:
      return "django.db.models.deletion.CASCADE";
  }
}
