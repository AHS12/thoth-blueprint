import { dataTypes } from "@/lib/db-types";
import type { DatabaseType } from "@/lib/types";

export interface ParsedSqlColumnType {
  baseName: string;
  length?: number;
  precision?: number;
  scale?: number;
  isUnsigned?: boolean;
}

/**
 * Parses common SQL-style declarations (e.g. VARCHAR(50), DECIMAL(10,2), INT UNSIGNED)
 * so they can be matched against ThothBlueprint's allowed type tokens.
 */
export function parseSqlColumnType(raw: string): ParsedSqlColumnType {
  let s = raw.trim().replace(/\s+/g, " ");
  const isUnsigned = /\bUNSIGNED\b/i.test(s);
  s = s
    .replace(/\bUNSIGNED\b/gi, "")
    .replace(/\bZEROFILL\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const parenOpen = s.indexOf("(");
  let baseName: string;
  let inner = "";

  if (parenOpen < 0) {
    baseName = s;
  } else {
    baseName = s.slice(0, parenOpen).trim();
    const parenClose = s.lastIndexOf(")");
    inner =
      parenClose > parenOpen ? s.slice(parenOpen + 1, parenClose).trim() : "";
  }

  const result: ParsedSqlColumnType = {
    baseName,
    ...(isUnsigned ? { isUnsigned: true } : {}),
  };

  if (!inner) return result;

  if (/^['"]/u.test(inner) || inner.includes("'") || inner.includes('"')) {
    return result;
  }

  const parts = inner.split(",").map((p) => p.trim());
  const n0 = parts[0] !== undefined ? parseInt(parts[0], 10) : NaN;
  const n1 = parts[1] !== undefined ? parseInt(parts[1], 10) : NaN;

  if (parts.length >= 2 && !Number.isNaN(n0) && !Number.isNaN(n1)) {
    result.precision = n0;
    result.scale = n1;
    return result;
  }

  if (parts.length >= 1 && !Number.isNaN(n0)) {
    const u = baseName.toUpperCase();
    if (
      u === "DECIMAL" ||
      u === "NUMERIC" ||
      u === "DEC" ||
      u === "FIXED"
    ) {
      result.precision = n0;
    } else if (
      u === "TIMESTAMP" ||
      u === "TIME" ||
      u === "DATETIME" ||
      u === "TIMESTAMPTZ" ||
      u === "TIMETZ"
    ) {
      result.precision = n0;
    } else {
      result.length = n0;
    }
  }

  return result;
}

export function resolveCanonicalColumnType(
  dbType: DatabaseType,
  rawType: string,
):
  | { ok: true; canonical: string; parsed: ParsedSqlColumnType }
  | { ok: false } {
  const parsed = parseSqlColumnType(rawType);
  const allowed = dataTypes[dbType];
  if (!allowed?.length) return { ok: false };

  const found = allowed.find(
    (x) => x.toLowerCase() === parsed.baseName.toLowerCase(),
  );
  if (!found) return { ok: false };

  return { ok: true, canonical: found, parsed };
}
