import { tableColors } from "@/lib/colors";
import { DbRelationship } from "@/lib/constants";
import { organizeTablesByRelationships } from "@/lib/layout-algorithms";
import { parseSqlColumnType } from "@/lib/ai/parseSqlColumnType";
import type {
  AppEdge,
  AppNode,
  AppNoteNode,
  CheckConstraint,
  Column,
  Diagram,
  EdgeData,
  Index,
} from "@/lib/types";
import { uuid } from "../utils";
import type {
  SqliteColumnInfo,
  SqliteForeignKeyInfo,
  SqliteSchemaInfo,
  SqliteTableInfo,
} from "./sqlite-ddl-types";

interface Diagnostic {
  level: "warning" | "error";
  message: string;
  table?: string;
  detail?: string;
}

interface TableDefinitionMetadata {
  generatedExpressions: Map<string, { expression: string; type: "VIRTUAL" | "STORED" }>;
  checks: CheckConstraint[];
}

function normalizeIdentifier(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("`") && value.endsWith("`")) ||
    (value.startsWith("[") && value.endsWith("]"))
  ) {
    return value.slice(1, -1).replace(/""/g, '"');
  }
  return value;
}

function identifierKey(value: string): string {
  return value.toLowerCase();
}

function splitTopLevelItems(body: string): string[] {
  const items: string[] = [];
  let current = "";
  let depth = 0;
  let quote: "single" | "double" | "backtick" | "bracket" | null = null;

  for (let index = 0; index < body.length; index++) {
    const ch = body[index];
    const next = body[index + 1];

    if (quote === "single") {
      current += ch;
      if (ch === "'" && next === "'") {
        current += next;
        index++;
      } else if (ch === "'") {
        quote = null;
      }
      continue;
    }

    if (quote === "double") {
      current += ch;
      if (ch === '"' && next === '"') {
        current += next;
        index++;
      } else if (ch === '"') {
        quote = null;
      }
      continue;
    }

    if (quote === "backtick") {
      current += ch;
      if (ch === "`") quote = null;
      continue;
    }

    if (quote === "bracket") {
      current += ch;
      if (ch === "]") quote = null;
      continue;
    }

    if (ch === "'") quote = "single";
    else if (ch === '"') quote = "double";
    else if (ch === "`") quote = "backtick";
    else if (ch === "[") quote = "bracket";
    else if (ch === "(") depth++;
    else if (ch === ")" && depth > 0) depth--;

    if (ch === "," && depth === 0) {
      const item = current.slice(0, -1).trim();
      if (item) items.push(item);
      current = "";
    } else {
      current += ch;
    }
  }

  const last = current.trim();
  if (last) items.push(last);
  return items;
}

function findMatchingParen(value: string, openIndex: number): number {
  let depth = 0;
  let quote: "single" | "double" | "backtick" | "bracket" | null = null;

  for (let index = openIndex; index < value.length; index++) {
    const ch = value[index];
    const next = value[index + 1];

    if (quote === "single") {
      if (ch === "'" && next === "'") index++;
      else if (ch === "'") quote = null;
      continue;
    }
    if (quote === "double") {
      if (ch === '"' && next === '"') index++;
      else if (ch === '"') quote = null;
      continue;
    }
    if (quote === "backtick") {
      if (ch === "`") quote = null;
      continue;
    }
    if (quote === "bracket") {
      if (ch === "]") quote = null;
      continue;
    }

    if (ch === "'") quote = "single";
    else if (ch === '"') quote = "double";
    else if (ch === "`") quote = "backtick";
    else if (ch === "[") quote = "bracket";
    else if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function extractTableBody(tableSql: string): string {
  const openIndex = tableSql.indexOf("(");
  if (openIndex < 0) return "";
  const closeIndex = findMatchingParen(tableSql, openIndex);
  return closeIndex > openIndex
    ? tableSql.slice(openIndex + 1, closeIndex)
    : "";
}

function extractFirstIdentifier(item: string): string {
  const value = item.trim();
  if (!value) return "";
  if (value[0] === '"') {
    const end = value.indexOf('"', 1);
    return normalizeIdentifier(end > 0 ? value.slice(0, end + 1) : value);
  }
  if (value[0] === "`") {
    const end = value.indexOf("`", 1);
    return normalizeIdentifier(end > 0 ? value.slice(0, end + 1) : value);
  }
  if (value[0] === "[") {
    const end = value.indexOf("]", 1);
    return normalizeIdentifier(end > 0 ? value.slice(0, end + 1) : value);
  }
  return normalizeIdentifier(value.split(/\s+/)[0] || "");
}

function extractParenthesized(value: string, openIndex: number): string {
  const closeIndex = findMatchingParen(value, openIndex);
  return closeIndex > openIndex ? value.slice(openIndex + 1, closeIndex).trim() : "";
}

function extractDefinitionMetadata(tableSql: string): TableDefinitionMetadata {
  const generatedExpressions = new Map<
    string,
    { expression: string; type: "VIRTUAL" | "STORED" }
  >();
  const checks: CheckConstraint[] = [];
  const body = extractTableBody(tableSql);

  splitTopLevelItems(body).forEach((item, index) => {
    const trimmed = item.trim();
    const itemName = extractFirstIdentifier(trimmed);
    const generatedIndex = trimmed.search(/\bAS\s*\(/i);
    if (generatedIndex >= 0) {
      const openIndex = trimmed.indexOf("(", generatedIndex);
      const expression = openIndex >= 0 ? extractParenthesized(trimmed, openIndex) : "";
      const generatedTypeMatch = trimmed.match(/\b(VIRTUAL|STORED)\s*$/i);
      if (itemName && expression && generatedTypeMatch?.[1]) {
        generatedExpressions.set(identifierKey(itemName), {
          expression,
          type: generatedTypeMatch[1].toUpperCase() as "VIRTUAL" | "STORED",
        });
      }
    }

    const checkIndex = trimmed.search(/\bCHECK\s*\(/i);
    if (checkIndex >= 0) {
      const openIndex = trimmed.indexOf("(", checkIndex);
      const expression = openIndex >= 0 ? extractParenthesized(trimmed, openIndex) : "";
      const constraintMatch = trimmed.match(/^CONSTRAINT\s+([^\s]+)\s+/i);
      checks.push({
        name: normalizeIdentifier(constraintMatch?.[1] || `chk_${index + 1}`),
        expression,
      });
    }
  });

  return { generatedExpressions, checks };
}

function parseDefaultValue(value: string | null): string | number | null | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (trimmed.toUpperCase() === "NULL") return null;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

function buildColumn(
  info: SqliteColumnInfo,
  metadata: TableDefinitionMetadata,
  tableSql: string,
): Column {
  const parsed = parseSqlColumnType(info.type || "BLOB");
  const type = parsed.baseName.trim().toUpperCase() || "BLOB";
  const generated = metadata.generatedExpressions.get(identifierKey(info.name));
  const column: Column = {
    id: uuid(),
    name: info.name,
    type,
    nullable: info.notnull !== 1 && info.pk === 0,
    pk: info.pk > 0,
    defaultValue: parseDefaultValue(info.dfltValue),
    isAutoIncrement: info.pk > 0 && type === "INTEGER" && /\bAUTOINCREMENT\b/i.test(tableSql),
  };

  if (parsed.length !== undefined) column.length = parsed.length;
  if (parsed.precision !== undefined) column.precision = parsed.precision;
  if (parsed.scale !== undefined) column.scale = parsed.scale;
  if (generated) {
    column.isGenerated = true;
    column.generatedExpression = generated.expression;
    column.generatedType = generated.type;
  }
  return column;
}

function createTableNode(
  table: SqliteTableInfo,
  index: number,
  columnYOffset: number[],
  diagnostics: Diagnostic[],
): AppNode {
  const metadata = extractDefinitionMetadata(table.sql);
  const columns = table.columns
    .filter((column) => {
      if (column.hidden === 1) {
        diagnostics.push({
          level: "warning",
          message: "Skipped hidden virtual-table column",
          table: table.name,
          detail: column.name,
        });
        return false;
      }
      return true;
    })
    .map((column) => buildColumn(column, metadata, table.sql));

  const columnMap = new Map(columns.map((column) => [identifierKey(column.name), column]));
  const indices: Index[] = [];

  table.indexes.forEach((sqliteIndex) => {
    if (sqliteIndex.origin === "pk") return;
    const indexColumns = sqliteIndex.columns
      .map((column) => (column.name ? columnMap.get(identifierKey(column.name)) : undefined))
      .filter((column): column is Column => Boolean(column));

    if (indexColumns.length !== sqliteIndex.columns.length || indexColumns.length === 0) {
      diagnostics.push({
        level: "warning",
        message: "Skipped index with unmappable columns",
        table: table.name,
        detail: sqliteIndex.name,
      });
      return;
    }

    if (sqliteIndex.isUnique && indexColumns.length === 1) {
      const firstIndexColumn = indexColumns[0];
      if (firstIndexColumn) firstIndexColumn.isUnique = true;
    }

    // SQLite creates sqlite_autoindex_* for inline UNIQUE constraints. Keep
    // the uniqueness information, but never persist SQLite's internal name.
    const indexName = sqliteIndex.name.toLowerCase().startsWith("sqlite_autoindex_")
      ? `uq_${table.name}_${indexColumns.map((column) => column.name).join("_")}`
      : sqliteIndex.name;
    indices.push({
      id: uuid(),
      name: indexName,
      columns: indexColumns.map((column) => column.id),
      isUnique: sqliteIndex.isUnique,
      type: sqliteIndex.isUnique ? "UNIQUE" : "INDEX",
    });
  });

  const cardWidth = 288;
  const xGap = 32;
  const yGap = 32;
  let columnIndex = 0;
  for (let current = 1; current < columnYOffset.length; current++) {
    if ((columnYOffset[current] ?? 0) < (columnYOffset[columnIndex] ?? 0)) columnIndex = current;
  }
  const x = columnIndex * (cardWidth + xGap);
  const y = columnYOffset[columnIndex] ?? 20;
  columnYOffset[columnIndex] = y + 60 + columns.length * 28 + yGap;

  const checkConstraints = metadata.checks.length > 0 ? metadata.checks : undefined;
  if (table.sql.toUpperCase().includes("WITHOUT ROWID") || table.sql.toUpperCase().includes(" STRICT")) {
    diagnostics.push({
      level: "warning",
      message: "SQLite table options were not represented in the diagram",
      table: table.name,
      detail: "WITHOUT ROWID or STRICT",
    });
  }

  return {
    id: uuid(),
    type: "table",
    position: { x, y },
    data: {
      label: table.name,
      columns,
      indices,
      comment: "",
      ...(checkConstraints ? { checkConstraints } : {}),
      color: tableColors[index % tableColors.length] || "",
      order: index,
    },
  };
}

function determineRelationship(
  sourceColumns: Column[],
  targetColumns: Column[],
  sourceTable: AppNode,
  targetTable: AppNode,
): string {
  const sourceIds = new Set(sourceColumns.map((column) => column.id));
  const targetIds = new Set(targetColumns.map((column) => column.id));
  const hasUniqueIndexFor = (node: AppNode, ids: Set<string>) =>
    (node.data.indices || []).some(
      (index) =>
        Boolean(index.isUnique) &&
        index.columns.length === ids.size &&
        index.columns.every((columnId) => ids.has(columnId)),
    );
  const sourceUnique =
    (sourceColumns.length === 1 && Boolean(sourceColumns[0]?.isUnique || sourceColumns[0]?.pk)) ||
    hasUniqueIndexFor(sourceTable, sourceIds);
  const targetUnique =
    (targetColumns.length === 1 && Boolean(targetColumns[0]?.isUnique || targetColumns[0]?.pk)) ||
    hasUniqueIndexFor(targetTable, targetIds) ||
    (() => {
      const primaryKeys = targetTable.data.columns.filter((column) => column.pk).map((column) => column.id);
      return primaryKeys.length === targetIds.size && primaryKeys.every((id) => targetIds.has(id));
    })();

  if (sourceUnique && targetUnique) return DbRelationship.ONE_TO_ONE;
  return targetUnique ? DbRelationship.MANY_TO_ONE : DbRelationship.MANY_TO_ONE;
}

function buildEdges(
  tables: SqliteTableInfo[],
  nodes: AppNode[],
  diagnostics: Diagnostic[],
): AppEdge[] {
  const nodeMap = new Map(nodes.map((node) => [identifierKey(node.data.label), node]));
  const tableInfoMap = new Map(tables.map((table) => [identifierKey(table.name), table]));
  const grouped = new Map<string, SqliteForeignKeyInfo[]>();

  tables.forEach((table) => {
    table.foreignKeys.forEach((foreignKey) => {
      const key = `${identifierKey(table.name)}:${foreignKey.id}`;
      const list = grouped.get(key) || [];
      list.push(foreignKey);
      grouped.set(key, list);
    });
  });

  return Array.from(grouped.entries()).flatMap(([key, rows]) => {
    const sourceTableName = key.split(":")[0] || "";
    const sourceNode = nodeMap.get(sourceTableName);
    const firstRow = rows[0];
    const targetNode = firstRow ? nodeMap.get(identifierKey(firstRow.targetTable)) : undefined;
    if (!sourceNode || !targetNode || !firstRow) {
      diagnostics.push({ level: "warning", message: "FK references unknown table", detail: key });
      return [];
    }

    const sourceColumns = rows
      .sort((a, b) => a.seq - b.seq)
      .map((row) => sourceNode.data.columns.find((column) => identifierKey(column.name) === identifierKey(row.sourceColumn)))
      .filter((column): column is Column => Boolean(column));
    const targetInfo = tableInfoMap.get(identifierKey(firstRow.targetTable));
    const targetPrimaryKeys = targetInfo?.columns
      .filter((column) => column.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((column) => column.name) || [];
    const targetColumns = rows
      .sort((a, b) => a.seq - b.seq)
      .map((row) => row.targetColumn || targetPrimaryKeys[row.seq])
      .map((name) => targetNode.data.columns.find((column) => name && identifierKey(column.name) === identifierKey(name)))
      .filter((column): column is Column => Boolean(column));

    if (sourceColumns.length !== rows.length || targetColumns.length !== rows.length) {
      diagnostics.push({ level: "warning", message: "FK columns not found", detail: key });
      return [];
    }

    const relationship = determineRelationship(sourceColumns, targetColumns, sourceNode, targetNode);
    return sourceColumns.flatMap((sourceColumn, index) => {
      const targetColumn = targetColumns[index];
      if (!targetColumn) return [];
      const edgeData: EdgeData = {
        relationship,
        constraintName: `fk_${sourceNode.data.label}_${firstRow.id}`,
        sourceColumns: sourceColumns.map((column) => column.name),
        targetColumns: targetColumns.map((column) => column.name),
        isComposite: rows.length > 1,
        ...(firstRow.onDelete !== "NO ACTION" ? { onDelete: firstRow.onDelete } : {}),
        ...(firstRow.onUpdate !== "NO ACTION" ? { onUpdate: firstRow.onUpdate } : {}),
      };
      return [{
        id: uuid(),
        source: sourceNode.id,
        target: targetNode.id,
        sourceHandle: `${sourceColumn.id}-right-source`,
        targetHandle: `${targetColumn.id}-left-target`,
        type: "custom",
        data: edgeData,
      }];
    });
  });
}

function getSchemaFromWorker(ddl: string): Promise<SqliteSchemaInfo> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../../workers/sqlite-ddl.worker.ts", import.meta.url), {
      type: "module",
    });
    const finish = () => worker.terminate();

    worker.onmessage = (event: MessageEvent<{ type: string; schema?: SqliteSchemaInfo; message?: string }>) => {
      finish();
      if (event.data.type === "success" && event.data.schema) {
        resolve(event.data.schema);
      } else {
        reject(new Error(event.data.message || "SQLite schema import failed."));
      }
    };
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || "SQLite worker failed to load."));
    };
    worker.postMessage({ type: "parse", ddl });
  });
}

export async function parseSqliteDdlAsync(
  ddl: string,
  onProgress?: (progress: number, label?: string) => void,
  reorganizeAfterImport = false,
): Promise<Diagram["data"]> {
  const schema = await getSchemaFromWorker(ddl);
  const diagnostics: Diagnostic[] = [];
  const nodes: AppNode[] = [];
  const total = schema.tables.length;
  const columnYOffset = Array(Math.min(Math.max(Math.ceil(Math.sqrt(total * 1.5)), 4), 8)).fill(20);

  for (let index = 0; index < schema.tables.length; index++) {
    const table = schema.tables[index];
    if (!table) continue;
    nodes.push(createTableNode(table, index, columnYOffset, diagnostics));
    onProgress?.(Math.round(((index + 1) / (total || 1)) * 100), `Parsed ${index + 1}/${total} tables`);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  const edges = buildEdges(schema.tables, nodes, diagnostics);
  const notes: AppNoteNode[] = diagnostics.length > 0
    ? [{
        id: uuid(),
        type: "note",
        position: { x: 20, y: 20 },
        data: {
          text: diagnostics
            .map((diagnostic) => `${diagnostic.level.toUpperCase()}: ${diagnostic.message}${diagnostic.table ? ` [${diagnostic.table}]` : ""}${diagnostic.detail ? ` - ${diagnostic.detail}` : ""}`)
            .join("\n"),
          color: "#fde68a",
        },
      }]
    : [];

  let finalResult: Diagram["data"] = {
    nodes,
    edges,
    notes,
    zones: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    isLocked: false,
  };

  if (reorganizeAfterImport && nodes.length > 0) {
    finalResult = { ...finalResult, nodes: organizeTablesByRelationships(nodes, edges) };
  }

  return finalResult;
}
