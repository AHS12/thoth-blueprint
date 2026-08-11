import type { AppEdge, AppNode, Column, Diagram, Index } from "@/lib/types";

interface SqliteExportOptions {
  exportForeignKeyConstraint?: boolean;
}

type ResolvedEdge = AppEdge & {
  sourceNode: AppNode;
  targetNode: AppNode;
};

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function quoteString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function columnType(column: Column): string {
  const type = column.type.trim() || "BLOB";
  const upperType = type.toUpperCase();
  if (column.length !== undefined && ["CHAR", "VARCHAR", "BINARY", "VARBINARY"].includes(upperType)) {
    return `${type}(${column.length})`;
  }
  if (column.precision !== undefined && column.scale !== undefined && ["DECIMAL", "NUMERIC"].includes(upperType)) {
    return `${type}(${column.precision}, ${column.scale})`;
  }
  if (column.precision !== undefined && ["DECIMAL", "NUMERIC"].includes(upperType)) {
    return `${type}(${column.precision})`;
  }
  return type;
}

function defaultValue(value: Column["defaultValue"]): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number" || typeof value === "boolean") return ` DEFAULT ${value}`;
  const trimmed = value.trim();
  if (
    /^(NULL|CURRENT_DATE|CURRENT_TIME|CURRENT_TIMESTAMP)$/i.test(trimmed) ||
    /^-?\d+(\.\d+)?$/.test(trimmed) ||
    trimmed.startsWith("(") ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return ` DEFAULT ${trimmed}`;
  }
  return ` DEFAULT ${quoteString(trimmed)}`;
}

function findColumn(node: AppNode, id: string): Column | undefined {
  return node.data.columns.find((column) => column.id === id);
}

function getColumnIdFromHandle(handle: string | null | undefined): string | null {
  if (!handle) return null;
  const parts = handle.split("-");
  return parts.length >= 3 ? parts.slice(0, -2).join("-") : handle;
}

function foreignKeyGroups(edges: ResolvedEdge[]): Array<{
  source: AppNode;
  target: AppNode;
  sourceColumns: string[];
  targetColumns: string[];
  onDelete?: string;
  onUpdate?: string;
}> {
  const groups = new Map<string, {
    source: AppNode;
    target: AppNode;
    sourceColumns: string[];
    targetColumns: string[];
    onDelete?: string;
    onUpdate?: string;
  }>();

  edges.forEach((edge) => {
    const source = edge.sourceNode;
    const target = edge.targetNode;
    if (!source || !target) return;

    const sourceColumn = findColumn(source, getColumnIdFromHandle(edge.sourceHandle) || "");
    const targetColumn = findColumn(target, getColumnIdFromHandle(edge.targetHandle) || "");
    if (!sourceColumn || !targetColumn) return;

    const edgeData = edge.data;
    const sourceColumns = edgeData?.sourceColumns || [sourceColumn.name];
    const targetColumns = edgeData?.targetColumns || [targetColumn.name];
    const key = `${source.id}:${target.id}:${edgeData?.constraintName || sourceColumns.join(",")}`;
    if (!groups.has(key)) {
      groups.set(key, {
        source,
        target,
        sourceColumns: [...sourceColumns],
        targetColumns: [...targetColumns],
        ...(edgeData?.onDelete ? { onDelete: edgeData.onDelete } : {}),
        ...(edgeData?.onUpdate ? { onUpdate: edgeData.onUpdate } : {}),
      });
    }
  });

  return Array.from(groups.values());
}

function renderColumn(column: Column, isInlinePrimaryKey: boolean): string {
  const parts = [quoteIdentifier(column.name), columnType(column)];
  if (isInlinePrimaryKey) parts.push("PRIMARY KEY");
  if (column.isAutoIncrement) parts.push("AUTOINCREMENT");
  if (!column.isGenerated && column.nullable === false && !isInlinePrimaryKey) parts.push("NOT NULL");
  if (!column.isGenerated && column.isUnique) parts.push("UNIQUE");
  if (column.isGenerated && column.generatedExpression) {
    parts.push(`GENERATED ALWAYS AS (${column.generatedExpression}) ${column.generatedType || "VIRTUAL"}`);
  } else {
    parts.push(defaultValue(column.defaultValue).trim());
  }
  return parts.filter(Boolean).join(" ");
}

export function exportToSqlite(
  diagram: Diagram,
  options: SqliteExportOptions = {},
): string {
  const nodes = diagram.data.nodes.filter((node) => !node.data.isDeleted);
  const statements: string[] = [];
  const exportForeignKeys = options.exportForeignKeyConstraint ?? true;
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const edges = diagram.data.edges
    .map((edge) => ({
      ...edge,
      sourceNode: nodeMap.get(edge.source),
      targetNode: nodeMap.get(edge.target),
    }))
    .filter((edge): edge is AppEdge & { sourceNode: AppNode; targetNode: AppNode } => Boolean(edge.sourceNode && edge.targetNode));

  nodes.forEach((node) => {
    const columns = node.data.columns;
    const primaryKeys = columns.filter((column) => column.pk);
    const singleAutoPrimaryKey = primaryKeys.length === 1 && primaryKeys[0]?.isAutoIncrement;
    const definitions = columns.map((column) =>
      renderColumn(column, Boolean(singleAutoPrimaryKey && column.pk)),
    );

    if (primaryKeys.length > 1) {
      definitions.push(`PRIMARY KEY (${primaryKeys.map((column) => quoteIdentifier(column.name)).join(", ")})`);
    }

    const checks = node.data.checkConstraints || [];
    checks.forEach((check) => {
      if (check.expression) definitions.push(`CONSTRAINT ${quoteIdentifier(check.name)} CHECK (${check.expression})`);
    });

    if (exportForeignKeys) {
      foreignKeyGroups(edges.filter((edge) => edge.source === node.id)).forEach((foreignKey) => {
        if (foreignKey.source.id !== node.id) return;
        const actions = [
          foreignKey.onDelete ? `ON DELETE ${foreignKey.onDelete}` : "",
          foreignKey.onUpdate ? `ON UPDATE ${foreignKey.onUpdate}` : "",
        ].filter(Boolean).join(" ");
        definitions.push(
          `FOREIGN KEY (${foreignKey.sourceColumns.map(quoteIdentifier).join(", ")}) REFERENCES ${quoteIdentifier(foreignKey.target.data.label)} (${foreignKey.targetColumns.map(quoteIdentifier).join(", ")})${actions ? ` ${actions}` : ""}`,
        );
      });
    }

    statements.push(`CREATE TABLE ${quoteIdentifier(node.data.label)} (\n  ${definitions.join(",\n  ")}\n);`);
  });

  nodes.forEach((node) => {
    (node.data.indices || []).forEach((index: Index) => {
      const columns = index.columns
        .map((columnId) => findColumn(node, columnId)?.name)
        .filter((name): name is string => Boolean(name));
      if (columns.length === 0) return;
      const indexName = index.name.toLowerCase().startsWith("sqlite_autoindex_")
        ? `uq_${node.data.label}_${columns.join("_")}`
        : index.name;
      statements.push(
        `CREATE ${index.isUnique ? "UNIQUE " : ""}INDEX ${quoteIdentifier(indexName)} ON ${quoteIdentifier(node.data.label)} (${columns.map(quoteIdentifier).join(", ")});`,
      );
    });
  });

  return `${statements.join("\n\n")}\n`;
}
