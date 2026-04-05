import { tableColors } from "@/lib/colors";
import { DbRelationship } from "@/lib/constants";
import { organizeTablesByRelationships } from "@/lib/layout-algorithms";
import {
  type AppEdge,
  type AppNode,
  type AppNoteNode,
  type CheckConstraint,
  type Column,
  type Diagram,
  type EdgeData,
  type Index,
} from "@/lib/types";
import { uuid } from "../utils";

interface ParsedForeignKey {
  sourceTable: string;
  sourceColumns: string[];
  targetTable: string;
  targetColumns: string[];
  constraintName: string;
  onDelete?: string;
  onUpdate?: string;
  deferrable?: boolean;
  initiallyDeferred?: boolean;
}

interface ParsedIndex {
  tableName: string;
  indexName: string;
  columns: string[];
  isUnique: boolean;
}

interface ParsedTableRef {
  schema?: string;
  name: string;
  qualifiedName: string;
}

interface Diagnostic {
  level: "warning" | "error";
  message: string;
  table?: string;
  detail?: string;
}

function stripComments(sql: string): string {
  let out = "";
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarQuoteTag = "";
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    // Handle dollar-quoted strings (PostgreSQL specific)
    if (!inSingle && !inDouble && !inLineComment && !inBlockComment) {
      if (ch === "$" && !dollarQuoteTag) {
        // Look for dollar quote tag like $tag$ or just $$
        let tagEnd = i + 1;
        while (tagEnd < sql.length && /[a-zA-Z0-9_]/.test(sql[tagEnd] || "")) {
          tagEnd++;
        }
        if (tagEnd < sql.length && sql[tagEnd] === "$") {
          dollarQuoteTag = sql.slice(i, tagEnd + 1);
          out += dollarQuoteTag;
          i = tagEnd + 1;
          continue;
        }
      } else if (
        dollarQuoteTag &&
        sql.slice(i, i + dollarQuoteTag.length) === dollarQuoteTag
      ) {
        out += dollarQuoteTag;
        i += dollarQuoteTag.length;
        dollarQuoteTag = "";
        continue;
      }
    }

    // Handle dollar-quoted content
    if (dollarQuoteTag) {
      out += ch;
      i++;
      continue;
    }

    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
        out += ch;
      }
      i++;
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    if (!inLineComment && !inBlockComment) {
      if (ch === "'" && !inDouble) {
        inSingle = !inSingle;
      } else if (ch === '"' && !inSingle) {
        inDouble = !inDouble;
      }
    }

    if (!inSingle && !inDouble) {
      if (ch === "-" && next === "-") {
        inLineComment = true;
        i += 2;
        continue;
      }
      if (ch === "/" && next === "*") {
        inBlockComment = true;
        i += 2;
        continue;
      }
    }

    out += ch;
    i++;
  }

  return out;
}

function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let dollarQuoteTag = "";
  let i = 0;

  const pushCurrent = () => {
    const s = current.trim();
    if (s.length) statements.push(s);
    current = "";
  };

  while (i < sql.length) {
    const ch = sql[i];
    // Handle dollar-quoted strings
    if (!inSingle && !inDouble && !dollarQuoteTag) {
      if (ch === "$") {
        let tagEnd = i + 1;
        while (tagEnd < sql.length && /[a-zA-Z0-9_]/.test(sql[tagEnd] || "")) {
          tagEnd++;
        }
        if (tagEnd < sql.length && sql[tagEnd] === "$") {
          dollarQuoteTag = sql.slice(i, tagEnd + 1);
          i = tagEnd + 1;
          continue;
        }
      }
    } else if (
      dollarQuoteTag &&
      sql.slice(i, i + dollarQuoteTag.length) === dollarQuoteTag
    ) {
      dollarQuoteTag = "";
      i += dollarQuoteTag.length;
      continue;
    }

    if (dollarQuoteTag) {
      current += ch;
      i++;
      continue;
    }

    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (!inSingle && !inDouble) {
      if (ch === "(") depth++;
      else if (ch === ")" && depth > 0) depth--;
    }

    if (
      ch === ";" &&
      !inSingle &&
      !inDouble &&
      depth === 0 &&
      !dollarQuoteTag
    ) {
      pushCurrent();
    } else {
      current += ch;
    }
    i++;
  }

  pushCurrent();

  return statements;
}

function splitQualifiedIdentifier(raw: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inDouble = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"') {
      inDouble = !inDouble;
      current += ch;
      continue;
    }
    if (ch === "." && !inDouble) {
      const token = current.trim();
      if (token) parts.push(token);
      current = "";
      continue;
    }
    current += ch;
  }

  const last = current.trim();
  if (last) parts.push(last);
  return parts;
}

function parseTableReference(raw: string): ParsedTableRef {
  const cleaned = raw.trim().replace(/^ONLY\s+/i, "");
  const parts = splitQualifiedIdentifier(cleaned);
  if (parts.length >= 2) {
    const schema = normalizeIdentifier(parts[parts.length - 2] || "");
    const name = normalizeIdentifier(parts[parts.length - 1] || "");
    return schema
      ? {
          schema,
          name,
          qualifiedName: `${schema}.${name}`,
        }
      : {
          name,
          qualifiedName: name,
        };
  }

  const name = normalizeIdentifier(parts[0] || cleaned);
  return { name, qualifiedName: name };
}

function parseIdentifierList(list: string): string[] {
  return splitTopLevelItems(list)
    .map((item) => {
      const token = item.trim();
      if (!token) return "";
      const first = token.match(/^"(?:[^"]|"")+"|^[^\s(]+/);
      return normalizeIdentifier(first?.[0] || token);
    })
    .filter(Boolean);
}

function parseReferentialActions(
  sqlLine: string,
): Pick<
  ParsedForeignKey,
  "onDelete" | "onUpdate" | "deferrable" | "initiallyDeferred"
> {
  const result: Pick<
    ParsedForeignKey,
    "onDelete" | "onUpdate" | "deferrable" | "initiallyDeferred"
  > = {};
  const delMatch = sqlLine.match(
    /ON\s+DELETE\s+(RESTRICT|CASCADE|SET\s+NULL|NO\s+ACTION|SET\s+DEFAULT)/i,
  );
  const updMatch = sqlLine.match(
    /ON\s+UPDATE\s+(RESTRICT|CASCADE|SET\s+NULL|NO\s+ACTION|SET\s+DEFAULT)/i,
  );
  if (delMatch && delMatch[1])
    result.onDelete = delMatch[1].toUpperCase().replace(/\s+/g, " ");
  if (updMatch && updMatch[1])
    result.onUpdate = updMatch[1].toUpperCase().replace(/\s+/g, " ");
  if (/\bDEFERRABLE\b/i.test(sqlLine)) result.deferrable = true;
  if (/\bINITIALLY\s+DEFERRED\b/i.test(sqlLine))
    result.initiallyDeferred = true;
  return result;
}

function parseForeignKeyLine(
  sqlLine: string,
  sourceTable: string,
  fallbackConstraintName?: string,
): ParsedForeignKey | null {
  const namedMatch = sqlLine.match(
    /CONSTRAINT\s+([^\s]+)\s+FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+([^\s(]+)\s*\(([^)]+)\)/i,
  );
  const simpleMatch = !namedMatch
    ? sqlLine.match(
        /FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+([^\s(]+)\s*\(([^)]+)\)/i,
      )
    : null;

  if (namedMatch) {
    const constraintName = normalizeIdentifier(
      namedMatch[1] ||
        fallbackConstraintName ||
        `fk_${sourceTable}_${uuid().slice(0, 8)}`,
    );
    const sourceColumns = parseIdentifierList(namedMatch[2] || "");
    const targetTableRef = parseTableReference(namedMatch[3] || "");
    const targetColumns = parseIdentifierList(namedMatch[4] || "");
    return {
      sourceTable,
      sourceColumns,
      targetTable: targetTableRef.qualifiedName || targetTableRef.name,
      targetColumns,
      constraintName,
      ...parseReferentialActions(sqlLine),
    };
  }

  if (simpleMatch) {
    const sourceColumns = parseIdentifierList(simpleMatch[1] || "");
    const targetTableRef = parseTableReference(simpleMatch[2] || "");
    const targetColumns = parseIdentifierList(simpleMatch[3] || "");
    const constraintName =
      fallbackConstraintName ||
      `fk_${sourceTable}_${sourceColumns[0] || uuid().slice(0, 8)}`;
    return {
      sourceTable,
      sourceColumns,
      targetTable: targetTableRef.qualifiedName || targetTableRef.name,
      targetColumns,
      constraintName: normalizeIdentifier(constraintName),
      ...parseReferentialActions(sqlLine),
    };
  }

  return null;
}

function parseCheckConstraintLine(
  sqlLine: string,
  fallbackName: string,
): CheckConstraint | null {
  const namedMatch = sqlLine.match(
    /CONSTRAINT\s+([^\s]+)\s+CHECK\s*\((.+)\)\s*$/i,
  );
  if (namedMatch) {
    return {
      name: normalizeIdentifier(namedMatch[1] || fallbackName),
      expression: (namedMatch[2] || "").trim(),
    };
  }

  const simpleMatch = sqlLine.match(/CHECK\s*\((.+)\)\s*$/i);
  if (simpleMatch) {
    return {
      name: fallbackName,
      expression: (simpleMatch[1] || "").trim(),
    };
  }

  return null;
}

function parseCommentValue(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (/^NULL$/i.test(trimmed)) return "";
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

function tableKey(value: string): string {
  return normalizeIdentifier(value).toLowerCase();
}

function normalizeIdentifier(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.includes(".")) {
    const parts = trimmed.split(".");
    const lastPart = parts[parts.length - 1];
    return lastPart ? normalizeIdentifier(lastPart) : "";
  }
  return trimmed;
}

function splitTopLevelItems(body: string): string[] {
  const items: string[] = [];
  let current = "";
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let dollarQuoteTag = "";
  let i = 0;

  while (i < body.length) {
    const ch = body[i];
    // Handle dollar-quoted strings
    if (!inSingle && !inDouble && !dollarQuoteTag) {
      if (ch === "$") {
        let tagEnd = i + 1;
        while (
          tagEnd < body.length &&
          /[a-zA-Z0-9_]/.test(body[tagEnd] || "")
        ) {
          tagEnd++;
        }
        if (tagEnd < body.length && body[tagEnd] === "$") {
          dollarQuoteTag = body.slice(i, tagEnd + 1);
          i = tagEnd + 1;
          continue;
        }
      }
    } else if (
      dollarQuoteTag &&
      body.slice(i, i + dollarQuoteTag.length) === dollarQuoteTag
    ) {
      dollarQuoteTag = "";
      i += dollarQuoteTag.length;
      continue;
    }

    if (dollarQuoteTag) {
      current += ch;
      i++;
      continue;
    }

    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (!inSingle && !inDouble) {
      if (ch === "(") depth++;
      else if (ch === ")" && depth > 0) depth--;
    }

    if (
      ch === "," &&
      !inSingle &&
      !inDouble &&
      depth === 0 &&
      !dollarQuoteTag
    ) {
      const item = current.trim();
      if (item.length) items.push(item);
      current = "";
    } else {
      current += ch;
    }
    i++;
  }
  const last = current.trim();
  if (last.length) items.push(last);
  return items;
}

function parseQuotedList(listStr: string): string[] {
  const result: string[] = [];
  let token = "";
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < listStr.length; i++) {
    const ch = listStr[i];
    const prev = listStr[i - 1];
    const isEscaped = prev === "\\";

    if (!isEscaped) {
      if (ch === "'" && !inDouble) {
        if (inSingle) {
          result.push(token);
          token = "";
          inSingle = false;
          continue;
        } else {
          inSingle = true;
          continue;
        }
      } else if (ch === '"' && !inSingle) {
        if (inDouble) {
          result.push(token);
          token = "";
          inDouble = false;
          continue;
        } else {
          inDouble = true;
          continue;
        }
      }
    }

    if (inSingle || inDouble) {
      token += ch;
    }
  }

  return result.map((s) => s.replace(/''/g, "'"));
}

function extractEnumTypes(sql: string): Map<string, string[]> {
  const enumMap = new Map<string, string[]>();
  const enumRegex = /CREATE\s+TYPE\s+([^\s]+)\s+AS\s+ENUM\s*\(([^)]+)\)/gi;

  let match;
  while ((match = enumRegex.exec(sql)) !== null) {
    const enumName = normalizeIdentifier(match[1] || "");
    const valuesStr = match[2] || "";
    const values = parseQuotedList(valuesStr);
    enumMap.set(enumName, values);
  }

  return enumMap;
}

export async function parsePostgreSqlDdlAsync(
  ddl: string,
  onProgress?: (progress: number, label?: string) => void,
  reorganizeAfterImport: boolean = false,
): Promise<Diagram["data"]> {
  const diagnostics: Diagnostic[] = [];
  const nodes: AppNode[] = [];
  const foreignKeys: ParsedForeignKey[] = [];
  const parsedIndexes: ParsedIndex[] = [];
  const tableComments = new Map<string, string>();
  const columnComments = new Map<string, string>();

  const enumTypes = extractEnumTypes(ddl);

  const cleaned = stripComments(ddl);
  const statements = splitStatements(cleaned);
  const tableStatements = statements.filter((s) =>
    /^\s*CREATE\s+TABLE/i.test(s),
  );
  const alterStatements = statements.filter((s) =>
    /^\s*ALTER\s+TABLE/i.test(s),
  );
  const indexStatements = statements.filter((s) =>
    /^\s*CREATE\s+(UNIQUE\s+)?INDEX/i.test(s),
  );
  const commentStatements = statements.filter((s) =>
    /^\s*COMMENT\s+ON\s+(TABLE|COLUMN)/i.test(s),
  );
  const total = tableStatements.length || 1;

  const totalTables = tableStatements.length;
  const NUM_COLUMNS = Math.min(
    Math.max(Math.ceil(Math.sqrt(totalTables * 1.5)), 4),
    8,
  );
  const CARD_WIDTH = 288;
  const X_GAP = 32;
  const Y_GAP = 32;
  const columnYOffset: number[] = Array(NUM_COLUMNS).fill(20);
  const estimateHeight = (columnCount: number) => 60 + columnCount * 28;

  const findMinHeightColumn = () => {
    let minHeight = columnYOffset[0] ?? 0;
    let minIndex = 0;
    for (let i = 1; i < NUM_COLUMNS; i++) {
      const height = columnYOffset[i] ?? 0;
      if (height < minHeight) {
        minHeight = height;
        minIndex = i;
      }
    }
    return minIndex;
  };

  for (
    let statementIndex = 0;
    statementIndex < tableStatements.length;
    statementIndex++
  ) {
    const statement = tableStatements[statementIndex];

    // Table name
    const tableNameMatch = statement?.match(
      /CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?([^\s(]+)/i,
    );
    if (!tableNameMatch) {
      diagnostics.push({
        level: "warning",
        message: "Unable to parse table name",
        detail: statement?.slice(0, 120) || "",
      });
      continue;
    }

    const rawTableName = tableNameMatch[2] || "";
    const parsedTableRef = parseTableReference(rawTableName);
    const tableName = parsedTableRef.name;
    const qualifiedTableName = parsedTableRef.qualifiedName;

    const columns: Column[] = [];
    const indices: Index[] = [];
    const checkConstraints: CheckConstraint[] = [];
    let tableComment = "";

    const tableBodyMatch = statement?.match(/\(([\s\S]*)\)/);
    if (!tableBodyMatch) {
      diagnostics.push({
        level: "warning",
        message: "Missing table body",
        table: tableName,
      });
      continue;
    }

    const tableBody = tableBodyMatch[1] || "";
    const items = splitTopLevelItems(tableBody);

    items.forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line) return;

      // Handle PRIMARY KEY
      if (/^PRIMARY\s+KEY/i.test(line)) {
        const pkMatch = line.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
        if (pkMatch) {
          const pkCols = (pkMatch[1] || "")
            .split(",")
            .map((c) => normalizeIdentifier(c.split(" ")[0]?.trim() ?? ""))
            .filter(Boolean);
          columns.forEach((c) => {
            if (pkCols.includes(c.name)) {
              c.pk = true;
              c.nullable = false;
            }
          });
        }
        return;
      }

      // Handle UNIQUE constraints
      if (
        /^CONSTRAINT\s+[^\s]+\s+UNIQUE/i.test(line) ||
        /^UNIQUE/i.test(line)
      ) {
        let constraintName = "";
        let columnsStr = "";

        const namedUniqueMatch = line.match(
          /CONSTRAINT\s+`?([^`\s]+)`?\s+UNIQUE\s*\(([^)]+)\)/i,
        );
        if (namedUniqueMatch) {
          constraintName = normalizeIdentifier(namedUniqueMatch[1] || "");
          columnsStr = namedUniqueMatch[2] || "";
        } else {
          const simpleUniqueMatch = line.match(/UNIQUE\s*\(([^)]+)\)/i);
          if (simpleUniqueMatch) {
            constraintName = `uq_${tableName}_${uuid().slice(0, 8)}`;
            columnsStr = simpleUniqueMatch[1] || "";
          }
        }

        if (columnsStr) {
          const colNames = columnsStr
            .split(",")
            .map((c) => normalizeIdentifier(c.trim()))
            .filter(Boolean);

          const colIds = colNames
            .map((n) => columns.find((c) => c.name === n)?.id)
            .filter((id): id is string => !!id);

          if (colIds.length > 0) {
            indices.push({
              id: uuid(),
              name: constraintName,
              columns: colIds,
              isUnique: true,
              type: "UNIQUE",
            });
          }
        }
        return;
      }

      // Handle FOREIGN KEY constraints
      if (/^(CONSTRAINT\s+[^\s]+\s+)?FOREIGN\s+KEY/i.test(line)) {
        const fk = parseForeignKeyLine(
          line,
          qualifiedTableName || tableName,
          `fk_${tableName}_${uuid().slice(0, 8)}`,
        );
        if (fk) foreignKeys.push(fk);
        return;
      }

      // Handle CHECK constraints
      if (/^CONSTRAINT\s+[^\s]+\s+CHECK/i.test(line) || /^CHECK/i.test(line)) {
        const check = parseCheckConstraintLine(
          line,
          `chk_${tableName}_${checkConstraints.length + 1}`,
        );
        if (check) checkConstraints.push(check);
        return;
      }

      // Handle column definitions
      const colMatch = line.match(
        /^`?([^`\s]+)`?\s+([^(\s]+(?:\([^)]+\))?)(.*)$/i,
      );
      if (!colMatch) return;

      const name = normalizeIdentifier(colMatch[1] || "");
      const typeString = (colMatch[2] || "").trim();
      const rest = (colMatch[3] || "").trim();

      const [type, length, precision, scale] = parsePostgreSqlType(typeString);

      const isNotNull = /\bNOT\s+NULL\b/i.test(rest);
      const isPrimaryKey = /\bPRIMARY\s+KEY\b/i.test(rest);
      const isAutoIncrement =
        /\bSERIAL\b/i.test(typeString) ||
        /\bBIGSERIAL\b/i.test(typeString) ||
        /\bGENERATED\s+ALWAYS\s+AS\s+IDENTITY\b/i.test(rest);
      const isUnique = /\bUNIQUE\b/i.test(rest);

      let defaultValue: string | number | null | undefined;
      const defaultMatch = rest.match(
        /\bDEFAULT\s+(?:'([^']*(?:''[^']*)*)'|(NULL)|([^(\s,]+(?:\([^)]*\))?))/i,
      );
      if (defaultMatch) {
        if (defaultMatch[2]) defaultValue = null;
        else if (defaultMatch[1])
          defaultValue = defaultMatch[1].replace(/''/g, "'");
        else if (defaultMatch[3]) {
          const val = defaultMatch[3];
          if (/^-?\d+(\.\d+)?$/.test(val)) defaultValue = parseFloat(val);
          else defaultValue = val;
        }
      }

      const commentMatch = rest.match(/\bCOMMENT\s*'([^']*)'/i);
      const comment = commentMatch?.[1] || "";

      // Check if this type is an enum type using the raw token,
      // so schema-qualified names like public.employment_type work.
      let enumValues: string | undefined;
      let isEnumColumn = false;

      const resolveEnumName = (token: string): string | undefined => {
        const t = token.trim();
        const candidate = t.includes(".")
          ? normalizeIdentifier(t.split(".").pop() || t)
          : normalizeIdentifier(t);
        return candidate && enumTypes.has(candidate) ? candidate : undefined;
      };

      const enumName = resolveEnumName(typeString);
      if (enumName) {
        isEnumColumn = true;
        enumValues = enumTypes.get(enumName)?.join(",") || "";
      }

      const column: Column = {
        id: uuid(),
        name,
        type: isEnumColumn ? "ENUM" : type,
        length: length || 0,
        precision: precision || 0,
        scale: scale || 0,
        nullable: !isNotNull && !isPrimaryKey,
        pk: isPrimaryKey,
        isAutoIncrement,
        isUnique,
        isUnsigned: false, // PostgreSQL doesn't have UNSIGNED
        defaultValue,
        comment,
      };
      if (enumValues) column.enumValues = enumValues;
      columns.push(column);

      // Handle inline REFERENCES (less common in PostgreSQL but possible)
      if (/\bREFERENCES\b/i.test(rest)) {
        const refMatch = rest.match(/REFERENCES\s+([^\s(]+)\s*\(([^)]+)\)/i);
        if (refMatch) {
          const targetTableRef = parseTableReference(refMatch[1] || "");
          const targetCols = parseIdentifierList(refMatch[2] || "");
          const fkObj: ParsedForeignKey = {
            sourceTable: qualifiedTableName || tableName,
            sourceColumns: [name],
            targetTable: targetTableRef.qualifiedName || targetTableRef.name,
            targetColumns: targetCols.length > 0 ? targetCols : ["id"],
            constraintName: `fk_${tableName}_${name}`,
            ...parseReferentialActions(rest),
          };
          foreignKeys.push(fkObj);
        }
      }
    });

    // Extract table comment from PostgreSQL table options
    const tableOptionsMatch = statement?.match(
      /\)\s*WITH\s*\([^)]*\)|\)\s*INHERITS/i,
    );
    if (tableOptionsMatch) {
      // PostgreSQL doesn't have table comments in CREATE TABLE like MySQL
      // Comments are added separately with COMMENT ON TABLE
      tableComment = "";
    }

    const colIndex = findMinHeightColumn();
    const x = colIndex * (CARD_WIDTH + X_GAP);
    const y = columnYOffset[colIndex] ?? 0;

    const node: AppNode = {
      id: uuid(),
      type: "table",
      position: { x, y },
      data: {
        label: tableName,
        columns,
        indices,
        comment: tableComment,
        checkConstraints,
        color: tableColors[statementIndex % tableColors.length] || "",
        order: statementIndex,
        qualifiedName: qualifiedTableName,
        ...(parsedTableRef.schema ? { schema: parsedTableRef.schema } : {}),
      },
    };
    nodes.push(node);
    columnYOffset[colIndex] =
      (columnYOffset[colIndex] ?? 0) + estimateHeight(columns.length) + Y_GAP;

    if (onProgress) {
      const pct = Math.round(((statementIndex + 1) / total) * 100);
      onProgress(pct, `Parsed ${statementIndex + 1}/${total} tables`);
    }
    // Yield to the event loop to keep UI responsive
    await new Promise((r) => setTimeout(r, 0));
  }

  alterStatements.forEach((statement) => {
    const alterFkMatch = statement.match(
      /ALTER\s+TABLE\s+(?:ONLY\s+)?([^\s]+)\s+ADD\s+CONSTRAINT\s+([^\s]+)\s+FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+([^\s(]+)\s*\(([^)]+)\)([\s\S]*)$/i,
    );
    if (alterFkMatch) {
      const sourceTableRef = parseTableReference(alterFkMatch[1] || "");
      const targetTableRef = parseTableReference(alterFkMatch[4] || "");
      const fkObj: ParsedForeignKey = {
        sourceTable: sourceTableRef.qualifiedName || sourceTableRef.name,
        sourceColumns: parseIdentifierList(alterFkMatch[3] || ""),
        targetTable: targetTableRef.qualifiedName || targetTableRef.name,
        targetColumns: parseIdentifierList(alterFkMatch[5] || ""),
        constraintName: normalizeIdentifier(
          alterFkMatch[2] || `fk_${sourceTableRef.name}_${uuid().slice(0, 8)}`,
        ),
        ...parseReferentialActions(alterFkMatch[6] || statement),
      };
      foreignKeys.push(fkObj);
      return;
    }

    const alterCheckMatch = statement.match(
      /ALTER\s+TABLE\s+(?:ONLY\s+)?([^\s]+)\s+ADD\s+CONSTRAINT\s+([^\s]+)\s+CHECK\s*\((.+)\)\s*$/i,
    );
    if (alterCheckMatch) {
      const tableRef = parseTableReference(alterCheckMatch[1] || "");
      const keyCandidates = [tableRef.qualifiedName, tableRef.name].map(
        tableKey,
      );
      const node = nodes.find((n) =>
        keyCandidates.includes(
          tableKey((n.data.qualifiedName as string) || n.data.label),
        ),
      );
      if (!node) {
        diagnostics.push({
          level: "warning",
          message: "CHECK references unknown table",
          detail: statement.slice(0, 160),
        });
        return;
      }
      const existingChecks = Array.isArray(node.data.checkConstraints)
        ? node.data.checkConstraints
        : [];
      existingChecks.push({
        name: normalizeIdentifier(
          alterCheckMatch[2] ||
            `chk_${node.data.label}_${existingChecks.length + 1}`,
        ),
        expression: (alterCheckMatch[3] || "").trim(),
      });
      node.data.checkConstraints = existingChecks;
    }
  });

  indexStatements.forEach((statement) => {
    const idxMatch = statement.match(
      /CREATE\s+(UNIQUE\s+)?INDEX(?:\s+CONCURRENTLY)?\s+([^\s]+)\s+ON\s+(?:ONLY\s+)?([^\s(]+)(?:\s+USING\s+\w+)?\s*\((.+)\)\s*$/i,
    );
    if (!idxMatch) return;
    const tableRef = parseTableReference(idxMatch[3] || "");
    parsedIndexes.push({
      tableName: tableRef.qualifiedName || tableRef.name,
      indexName: normalizeIdentifier(
        idxMatch[2] || `idx_${tableRef.name}_${uuid().slice(0, 8)}`,
      ),
      columns: parseIdentifierList(idxMatch[4] || ""),
      isUnique: Boolean(idxMatch[1]),
    });
  });

  commentStatements.forEach((statement) => {
    const tableMatch = statement.match(
      /COMMENT\s+ON\s+TABLE\s+([^\s]+)\s+IS\s+(.+)$/i,
    );
    if (tableMatch) {
      const tableRef = parseTableReference(tableMatch[1] || "");
      const value = parseCommentValue(tableMatch[2] || "");
      tableComments.set(tableKey(tableRef.qualifiedName), value);
      tableComments.set(tableKey(tableRef.name), value);
      return;
    }

    const colMatch = statement.match(
      /COMMENT\s+ON\s+COLUMN\s+([^\s]+)\s+IS\s+(.+)$/i,
    );
    if (colMatch) {
      const rawRef = colMatch[1] || "";
      const parts = splitQualifiedIdentifier(rawRef);
      if (parts.length < 2) return;
      const column = normalizeIdentifier(parts[parts.length - 1] || "");
      const tableRaw = parts.slice(0, parts.length - 1).join(".");
      const tableRef = parseTableReference(tableRaw);
      const value = parseCommentValue(colMatch[2] || "");
      columnComments.set(
        `${tableKey(tableRef.qualifiedName)}.${column.toLowerCase()}`,
        value,
      );
      columnComments.set(
        `${tableKey(tableRef.name)}.${column.toLowerCase()}`,
        value,
      );
    }
  });

  const tableMap = new Map<string, AppNode>();
  nodes.forEach((n) => {
    const label = n.data.label;
    const qualifiedName =
      typeof n.data.qualifiedName === "string" ? n.data.qualifiedName : label;
    tableMap.set(tableKey(label), n);
    tableMap.set(tableKey(qualifiedName), n);

    const resolvedTableComment =
      tableComments.get(tableKey(qualifiedName)) ||
      tableComments.get(tableKey(label));
    if (resolvedTableComment !== undefined)
      n.data.comment = resolvedTableComment;

    n.data.columns.forEach((col) => {
      const colKeyQualified = `${tableKey(qualifiedName)}.${col.name.toLowerCase()}`;
      const colKeySimple = `${tableKey(label)}.${col.name.toLowerCase()}`;
      const colComment =
        columnComments.get(colKeyQualified) || columnComments.get(colKeySimple);
      if (colComment !== undefined) col.comment = colComment;
    });
  });

  parsedIndexes.forEach((idx) => {
    const tableNode = tableMap.get(tableKey(idx.tableName));
    if (!tableNode) {
      diagnostics.push({
        level: "warning",
        message: "Index references unknown table",
        detail: `${idx.indexName} -> ${idx.tableName}`,
      });
      return;
    }

    const colIds = idx.columns
      .map(
        (name) =>
          tableNode.data.columns.find(
            (c) => c.name.toLowerCase() === name.toLowerCase(),
          )?.id,
      )
      .filter((id): id is string => Boolean(id));

    if (colIds.length === 0) return;
    const indices = tableNode.data.indices || [];
    indices.push({
      id: uuid(),
      name: idx.indexName,
      columns: colIds,
      isUnique: idx.isUnique,
      type: idx.isUnique ? "UNIQUE" : "INDEX",
    });
    tableNode.data.indices = indices;

    if (idx.isUnique && idx.columns.length === 1) {
      const uniqueCol = tableNode.data.columns.find(
        (c) => c.name.toLowerCase() === idx.columns[0]?.toLowerCase(),
      );
      if (uniqueCol) uniqueCol.isUnique = true;
    }
  });

  const edges: AppEdge[] = foreignKeys.flatMap((fk) => {
    const sourceNode = tableMap.get(tableKey(fk.sourceTable));
    const targetNode = tableMap.get(tableKey(fk.targetTable));
    if (!sourceNode || !targetNode) {
      diagnostics.push({
        level: "warning",
        message: "FK references unknown table",
        detail: `${fk.sourceTable} -> ${fk.targetTable}`,
      });
      return [];
    }

    const sourceCols = fk.sourceColumns
      .map((name) => sourceNode.data.columns.find((c) => c.name === name))
      .filter((c): c is Column => !!c);
    const targetCols = fk.targetColumns
      .map((name) => targetNode.data.columns.find((c) => c.name === name))
      .filter((c): c is Column => !!c);

    if (
      sourceCols.length !== fk.sourceColumns.length ||
      targetCols.length !== fk.targetColumns.length
    ) {
      diagnostics.push({
        level: "warning",
        message: "FK columns not found",
        detail: fk.constraintName,
      });
      return [];
    }

    const relationship = determineRelationshipComposite(
      sourceCols,
      targetCols,
      sourceNode,
      targetNode,
    );

    const edgeList: AppEdge[] = [];
    const pairCount = Math.min(sourceCols.length, targetCols.length);
    for (let i = 0; i < pairCount; i++) {
      const sc = sourceCols[i];
      const tc = targetCols[i];
      const edgeData: EdgeData = {
        relationship,
        constraintName: fk.constraintName,
        sourceColumns: fk.sourceColumns,
        targetColumns: fk.targetColumns,
        isComposite: fk.sourceColumns.length > 1 || fk.targetColumns.length > 1,
        ...(fk.onDelete ? { onDelete: fk.onDelete } : {}),
        ...(fk.onUpdate ? { onUpdate: fk.onUpdate } : {}),
        ...(fk.deferrable ? { deferrable: fk.deferrable } : {}),
        ...(fk.initiallyDeferred
          ? { initiallyDeferred: fk.initiallyDeferred }
          : {}),
      };
      edgeList.push({
        id: uuid(),
        source: sourceNode.id,
        target: targetNode.id,
        sourceHandle: `${sc?.id}-right-source`,
        targetHandle: `${tc?.id}-left-target`,
        type: "custom",
        data: edgeData,
      });
    }

    return edgeList;
  });

  const notes: AppNoteNode[] = [];
  if (diagnostics.length > 0) {
    const text = diagnostics
      .map(
        (d) =>
          `${d.level.toUpperCase()}: ${d.message}${d.table ? ` [${d.table}]` : ""}${d.detail ? ` - ${d.detail}` : ""}`,
      )
      .join("\n");
    notes.push({
      id: uuid(),
      type: "note",
      position: { x: 20, y: 20 },
      data: { text, color: "#fde68a" },
    });
  }

  let finalResult = {
    nodes,
    edges,
    notes,
    zones: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    isLocked: false,
  };

  // Apply relationship-based reorganization if requested
  if (reorganizeAfterImport && nodes.length > 0) {
    const organizedNodes = organizeTablesByRelationships(nodes, edges);
    finalResult = { ...finalResult, nodes: organizedNodes };
  }

  return finalResult;
}

function determineRelationshipComposite(
  sourceColumns: Column[],
  targetColumns: Column[],
  sourceTable: AppNode,
  targetTable: AppNode,
): string {
  const sourceIds = new Set(sourceColumns.map((c) => c.id));
  const targetIds = new Set(targetColumns.map((c) => c.id));

  const hasUniqueIndexFor = (node: AppNode, ids: Set<string>): boolean => {
    const indices = node.data.indices || [];
    return indices.some((idx) => {
      if (!idx.isUnique) return false;
      if (idx.columns.length !== ids.size) return false;
      return idx.columns.every((cid) => ids.has(cid));
    });
  };

  const isSourceUnique =
    (sourceColumns.length === 1 &&
      (sourceColumns[0]?.isUnique || sourceColumns[0]?.pk)) ||
    hasUniqueIndexFor(sourceTable, sourceIds);

  const isTargetUnique =
    (targetColumns.length === 1 &&
      (targetColumns[0]?.pk || targetColumns[0]?.isUnique)) ||
    hasUniqueIndexFor(targetTable, targetIds) ||
    (() => {
      const pkCols = (targetTable.data.columns as Column[])
        .filter((c) => c.pk)
        .map((c) => c.id);
      return (
        pkCols.length === targetIds.size &&
        pkCols.every((id) => targetIds.has(id))
      );
    })();

  if (isSourceUnique && isTargetUnique) return DbRelationship.ONE_TO_ONE;
  if (isTargetUnique) return DbRelationship.MANY_TO_ONE;
  return DbRelationship.MANY_TO_ONE;
}

function parsePostgreSqlType(
  typeString: string,
): [string, number | undefined, number | undefined, number | undefined] {
  const cleanType = typeString.trim().toUpperCase();

  // Handle SERIAL types
  if (cleanType === "SERIAL") {
    return ["INTEGER", undefined, undefined, undefined];
  }
  if (cleanType === "BIGSERIAL") {
    return ["BIGINT", undefined, undefined, undefined];
  }
  if (cleanType === "SMALLSERIAL") {
    return ["SMALLINT", undefined, undefined, undefined];
  }

  const typeMatch = cleanType.match(/^(\w+)(?:\(([^)]+)\))?/i);
  if (!typeMatch) {
    return [typeString.toUpperCase(), undefined, undefined, undefined];
  }

  const type = (typeMatch[1] || "").toUpperCase();
  const paramsStr = typeMatch[2];

  if (!paramsStr) {
    return [type, undefined, undefined, undefined];
  }

  // For time types with precision: TIMESTAMP(p), TIME(p)
  if (["TIMESTAMP", "TIME", "TIMESTAMPTZ", "TIMESTAMPTZ"].includes(type)) {
    const p = parseInt(paramsStr.trim(), 10);
    return [type, isNaN(p) ? undefined : p, undefined, undefined];
  }

  // For numeric types with precision and scale
  if (["NUMERIC", "DECIMAL"].includes(type)) {
    const params = paramsStr
      .split(",")
      .map((p) => {
        const num = parseInt(p.trim(), 10);
        return isNaN(num) ? undefined : num;
      })
      .filter((p): p is number => p !== undefined);

    if (params.length === 2) {
      return [type, undefined, params[0], params[1]];
    }
    if (params.length === 1) {
      return [type, params[0], undefined, undefined];
    }
  }

  // For character types with length
  if (["VARCHAR", "CHAR", "CHARACTER", "CHARACTER VARYING"].includes(type)) {
    const length = parseInt(paramsStr.trim(), 10);
    return [type, isNaN(length) ? undefined : length, undefined, undefined];
  }

  return [type, undefined, undefined, undefined];
}
