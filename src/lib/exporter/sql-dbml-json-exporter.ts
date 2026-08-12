import { exporter } from "@dbml/core";
import { type AppNode, type Column, type Diagram, type Index } from "../types";
import { DbRelationship } from "../constants";
import { useStore } from "@/store/store";
import { exportToSqlite } from "./sqlite-sql-exporter";

interface ExportOptions {
  exportForeignKeyConstraint?: boolean;
}

const diagramToDbml = (diagram: Diagram, options: ExportOptions = {}): string => {
  const { nodes, edges } = diagram.data;
  let tableDbml = "";
  const enumDefinitions = new Set<string>();
  const enumTypeMap = new Map<string, string>();
  const shouldExportFks =
    options.exportForeignKeyConstraint ?? useStore.getState().settings.exportForeignKeyConstraint ?? true;

  // First pass: find all enums and prepare definitions
  nodes
    .filter((n) => !n.data.isDeleted)
    .forEach((node) => {
      node.data.columns.forEach((col: Column) => {
        if (col.type.toUpperCase() === "ENUM" && col.enumValues) {
          const enumTypeName = `${node.data.label}_${col.name}_enum`;
          // Use a unique key for the map, combining node and column IDs
          enumTypeMap.set(`${node.id}-${col.id}`, enumTypeName);

          const values = col.enumValues
            .split(",")
            .map((v) => v.trim())
            .filter((v) => v)
            .map((v) => `  "${v}"`)
            .join("\n");

          const enumDef = `Enum ${enumTypeName} {\n${values}\n}\n`;
          enumDefinitions.add(enumDef);
        }
      });
    });

  // Second pass: build table definitions using the enum map
  nodes
    .filter((n) => !n.data.isDeleted)
    .forEach((node) => {
      tableDbml += `Table ${node.data.label} {\n`;
      if (node.data.comment) {
        tableDbml += `  note: '''${node.data.comment}'''\n`;
      }

      node.data.columns.forEach((col: Column) => {
        let finalColumnType = col.type;
        const upperType = col.type.toUpperCase();

        if (enumTypeMap.has(`${node.id}-${col.id}`)) {
          finalColumnType = enumTypeMap.get(`${node.id}-${col.id}`)!;
        } else if (
          upperType === "SET" &&
          col.enumValues &&
          diagram.dbType === "mysql"
        ) {
          const values = col.enumValues
            .split(",")
            .map((v) => `'${v.trim()}'`)
            .join(", ");
          finalColumnType = `SET(${values})`;
        } else if (
          ["VARCHAR", "CHAR", "BINARY", "VARBINARY", "BIT"].includes(upperType)
        ) {
          let defaultLength = 255;
          if (upperType === "CHAR" || upperType === "BIT") defaultLength = 1;

          // For PostgreSQL, VARCHAR without length is valid and means unlimited
          // For MySQL, we need to provide a default length
          const length =
            col.length || (diagram.dbType === "mysql" ? defaultLength : null);
          if (
            length &&
            (diagram.dbType === "mysql" ||
              (diagram.dbType === "postgres" && upperType === "CHAR"))
          ) {
            finalColumnType = `${col.type}(${length})`;
          }
        } else if (["DECIMAL", "NUMERIC"].includes(upperType)) {
          const precision = col.precision;
          const scale = col.scale;
          if (precision !== undefined && scale !== undefined) {
            finalColumnType = `${col.type}(${precision}, ${scale})`;
          } else if (precision !== undefined) {
            finalColumnType = `${col.type}(${precision})`;
          } else if (diagram.dbType === "mysql") {
            finalColumnType = `${col.type}(10, 2)`;
          }
        }

        tableDbml += `  ${col.name} ${finalColumnType}`;

        const settings = [];
        if (col.pk) settings.push("pk");
        if (col.isUnique) settings.push("unique");
        if (col.isAutoIncrement) settings.push("increment");
        if (!col.nullable) settings.push("not null");
        if (
          col.defaultValue !== undefined &&
          col.defaultValue !== null &&
          col.defaultValue !== ""
        ) {
          if (
            typeof col.defaultValue === "string" &&
            !/^\d+$/.test(col.defaultValue)
          ) {
            settings.push(`default: '${col.defaultValue}'`);
          } else {
            settings.push(`default: ${col.defaultValue}`);
          }
        }
        if (col.comment) {
          settings.push(`note: '${col.comment}'`);
        }

        if (settings.length > 0) {
          tableDbml += ` [${settings.join(", ")}]`;
        }
        tableDbml += "\n";
      });

      if (node.data.indices && node.data.indices.length > 0) {
        tableDbml += `\n  Indexes {\n`;
        node.data.indices.forEach((index: Index) => {
          const columnNames = index.columns
            .map(
              (colId: string) =>
                (node.data.columns as Column[]).find(
                  (c: Column) => c.id === colId
                )?.name
            )
            .filter(Boolean);
          if (columnNames.length > 0) {
            tableDbml += `    (${columnNames.join(", ")}) [name: '${
              index.name
            }'${index.isUnique ? ", unique" : ""}]\n`;
          }
        });
        tableDbml += `  }\n`;
      }

      tableDbml += "}\n\n";
    });

  let relationshipsDbml = "";
  if (shouldExportFks) {
  edges.forEach((edge) => {
    const sourceNode = nodes.find((n) => n.id === edge.source) as
      | AppNode
      | undefined;
    const targetNode = nodes.find((n) => n.id === edge.target) as
      | AppNode
      | undefined;
    // Extract column ID from handle ID (format: "columnId-side-type")
    const getColumnIdFromHandle = (
      handleId: string | null | undefined
    ): string | null => {
      if (!handleId) return null;
      // Handle both old format (just column ID) and new format (columnId-side-type)
      const parts = handleId.split("-");
      return parts.length >= 3 ? parts.slice(0, -2).join("-") : handleId;
    };

    const sourceColumnId = getColumnIdFromHandle(edge.sourceHandle);
    const targetColumnId = getColumnIdFromHandle(edge.targetHandle);

    const sourceColumn = sourceNode?.data.columns.find(
      (c: Column) => c.id === sourceColumnId
    );
    const targetColumn = targetNode?.data.columns.find(
      (c: Column) => c.id === targetColumnId
    );

    if (sourceNode && targetNode && sourceColumn && targetColumn) {
      let relationship = "-";
      switch (edge.data?.relationship) {
        case DbRelationship.ONE_TO_ONE:
          relationship = "-";
          break;
        case DbRelationship.ONE_TO_MANY:
          relationship = "<";
          break;
        case DbRelationship.MANY_TO_ONE:
          relationship = ">";
          break;
        case DbRelationship.MANY_TO_MANY:
          relationship = "<>";
          break;
      }
      relationshipsDbml += `Ref: ${sourceNode.data.label}.${sourceColumn.name} ${relationship} ${targetNode.data.label}.${targetColumn.name}\n`;
    }
  });
  }

  // Combine all parts, with enums first to ensure correct dependency order
  const dbmlString =
    Array.from(enumDefinitions).join("\n") + tableDbml + relationshipsDbml;
  return dbmlString;
};

export const exportToDbml = (diagram: Diagram, options: ExportOptions = {}): string => {
  return diagramToDbml(diagram, options);
};

export const exportToSql = (diagram: Diagram, options: ExportOptions = {}): string => {
  if (diagram.dbType === "sqlite") {
    return exportToSqlite(diagram, options);
  }
  const dbmlString = diagramToDbml(diagram, options);
  return exporter.export(dbmlString, diagram.dbType);
};

export const exportToJson = (diagram: Diagram): string => {
  return JSON.stringify(diagram.data, null, 2);
};
