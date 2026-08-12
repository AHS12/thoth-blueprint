import { tableColors } from "@/lib/colors";
import { DbRelationship } from "@/lib/constants";
import { organizeTablesByRelationships } from "@/lib/layout-algorithms";
import {
    type AppEdge,
    type AppNode,
    type Column,
    type Diagram,
    type Index,
    type TableNodeData,
} from "@/lib/types";
import { Parser } from "@dbml/core";

// Type definitions for DBML parser objects
interface DbmlEnumValue {
    name: string;
}

interface DbmlEnum {
    name: string;
    values: DbmlEnumValue[];
}

interface DbmlType {
    type_name: string;
}

interface DbmlField {
    name: string;
    type: DbmlType;
    pk: boolean;
    not_null: boolean;
    increment: boolean;
    unique: boolean;
    dbdefault_value?: string;
    note?: string;
}

interface DbmlIndexColumn {
    value: string;
}

interface DbmlIndex {
    name?: string;
    columns: DbmlIndexColumn[];
    unique: boolean;
    type?: string;
}

interface DbmlTable {
    name: string;
    fields: DbmlField[];
    indexes?: DbmlIndex[];
    note?: string;
}

interface DbmlEndpoint {
    tableName: string;
    fieldNames: string[];
    relation: string;
}

interface DbmlRef {
    endpoints: DbmlEndpoint[];
}

export async function parseDbmlAsync(
  content: string,
  onProgress: (progress: number, label: string) => void,
  reorganizeAfterImport: boolean = false
): Promise<Diagram["data"]> {
  return new Promise((resolve, reject) => {
    try {
      onProgress(10, "Parsing DBML content...");
      
      // Pre-process DBML to fix parser issues with nested notes
      const processedContent = preprocessDbml(content);
      
      const parser = new Parser();
      const database = parser.parse(processedContent, "dbml");
      
      onProgress(30, "Processing schemas...");

      const nodes: AppNode[] = [];
      const edges: AppEdge[] = [];
      const schema = database.schemas[0]; // Usually there is one schema in DBML export
      
      if (!schema) {
          throw new Error("No schema found in DBML content");
      }

      onProgress(50, "Creating tables...");

      // Build enum map from schema enums
      const enumMap = new Map<string, string>();
      if (schema.enums) {
          schema.enums.forEach((enumDef: DbmlEnum) => {
              const values = enumDef.values.map((v: DbmlEnumValue) => v.name).join(',');
              enumMap.set(enumDef.name, values);
          });
      }

      // Map to store table IDs for relationship creation
      const tableIdMap = new Map<string, string>();
      const columnIdMap = new Map<string, string>(); // Key: "tableName.columnName", Value: columnId

      schema.tables.forEach((table: DbmlTable, index: number) => {
        const tableId = `table-${Date.now()}-${index}`;
        tableIdMap.set(table.name, tableId);

        const columns: Column[] = table.fields.map((field: DbmlField, colIndex: number) => {
            const colId = `col-${Date.now()}-${index}-${colIndex}`;
            columnIdMap.set(`${table.name}.${field.name}`, colId);
            
            // Resolve enum type names to their values
            const fieldTypeName = field.type.type_name;
            let enumValues = enumMap.get(fieldTypeName);
            let actualType = fieldTypeName;
            
            // Check if this is an inline SET or ENUM type (e.g., SET('active', 'archived'))
            const setMatch = fieldTypeName.match(/^SET\s*\((.+)\)$/i);
            const enumMatch = !setMatch ? fieldTypeName.match(/^ENUM\s*\((.+)\)$/i) : null;
            
            if (setMatch && setMatch[1]) {
                // Extract values from inline SET definition
                const valuesStr = setMatch[1];
                const values = valuesStr.split(',').map((v: string) => v.trim().replace(/^['"]|['"]$/g, ''));
                enumValues = values.join(',');
                actualType = 'SET';
            } else if (enumMatch && enumMatch[1]) {
                // Extract values from inline ENUM definition
                const valuesStr = enumMatch[1];
                const values = valuesStr.split(',').map((v: string) => v.trim().replace(/^['"]|['"]$/g, ''));
                enumValues = values.join(',');
                actualType = 'ENUM';
            } else if (enumValues) {
                // This is a reference to a named enum
                actualType = 'ENUM';
            }
            
            const column: Column = {
                id: colId,
                name: field.name,
                type: actualType,
                pk: field.pk,
                nullable: !field.not_null,
                isAutoIncrement: field.increment,
                isUnique: field.unique,
                defaultValue: field.dbdefault_value,
            };
            
            // Only add comment if it exists
            if (field.note) {
                column.comment = field.note;
            }
            
            if (enumValues) {
                column.enumValues = enumValues;
            }
            
            return column;
        });

        const indices: Index[] = (table.indexes || []).map((idx: DbmlIndex, idxIndex: number) => {
            const indexType = idx.type ? idx.type.toUpperCase() : "INDEX";
            return {
                id: `idx-${Date.now()}-${index}-${idxIndex}`,
                name: idx.name || `idx_${table.name}_${idxIndex}`,
                columns: idx.columns.map((col: DbmlIndexColumn) => {
                    return columnIdMap.get(`${table.name}.${col.value}`) || ""; 
                }).filter(Boolean),
                isUnique: idx.unique,
                type: (indexType === "INDEX" || indexType === "UNIQUE" || indexType === "FULLTEXT" || indexType === "SPATIAL") 
                    ? indexType 
                    : "INDEX"
            };
        });

        const tableData: TableNodeData = {
            label: table.name,
            columns,
            indices,
            color: tableColors[index % tableColors.length] || "#ffffff",
            order: index
        };
        
        // Only add comment if it exists
        if (table.note) {
            tableData.comment = table.note;
        }

        nodes.push({
            id: tableId,
            type: "table",
            position: { x: 0, y: 0 }, // Will be organized later
            data: tableData
        });
      });

      onProgress(70, "Creating relationships...");

      // Process relationships (Refs)
      if (schema.refs) {
          schema.refs.forEach((ref: DbmlRef, index: number) => {
              const sourceEndpoint = ref.endpoints[0];
              const targetEndpoint = ref.endpoints[1];
              
              // Ensure both endpoints exist
              if (!sourceEndpoint || !targetEndpoint) {
                  return;
              }
              
              const sourceTable = sourceEndpoint.tableName;
              const targetTable = targetEndpoint.tableName;
              const sourceColumn = sourceEndpoint.fieldNames[0];
              const targetColumn = targetEndpoint.fieldNames[0];
              
              const sourceNodeId = tableIdMap.get(sourceTable);
              const targetNodeId = tableIdMap.get(targetTable);
              const sourceColId = columnIdMap.get(`${sourceTable}.${sourceColumn}`);
              const targetColId = columnIdMap.get(`${targetTable}.${targetColumn}`);

              if (sourceNodeId && targetNodeId && sourceColId && targetColId) {
                  // Determine relationship type
                  let relationship = DbRelationship.ONE_TO_MANY; // Default
                  
                  const sourceRel = sourceEndpoint.relation;
                  const targetRel = targetEndpoint.relation;

                  if (sourceRel === '1' && targetRel === '*') {
                      relationship = DbRelationship.ONE_TO_MANY;
                  } else if (sourceRel === '*' && targetRel === '1') {
                      relationship = DbRelationship.MANY_TO_ONE;
                  } else if (sourceRel === '1' && targetRel === '1') {
                      relationship = DbRelationship.ONE_TO_ONE;
                  } else if (sourceRel === '*' && targetRel === '*') {
                      relationship = DbRelationship.MANY_TO_MANY;
                  }

                  edges.push({
                      id: `edge-${Date.now()}-${index}`,
                      source: sourceNodeId,
                      target: targetNodeId,
                      sourceHandle: `${sourceColId}-right-source`,
                      targetHandle: `${targetColId}-left-target`,
                      type: "custom",
                      data: {
                          relationship
                      }
                  });
              }
          });
      }

      onProgress(90, "Finalizing layout...");

      let finalNodes = nodes;
      if (reorganizeAfterImport) {
          finalNodes = organizeTablesByRelationships(nodes, edges);
      }

      resolve({
          nodes: finalNodes,
          edges,
          viewport: { x: 0, y: 0, zoom: 1 },
          isLocked: false
      });

    } catch (error) {
      reject(error);
    }
  });
}

function preprocessDbml(content: string): string {
    const lines = content.split('\n');
    const processedLines: string[] = [];
    let currentTableLineIndex = -1;
    let tableDepth = -1;
    let currentDepth = 0;

    for (const line of lines) {
        const trimmed = line.trim();
        
        // Check for Table start
        if (trimmed.startsWith('Table ')) {
            currentTableLineIndex = processedLines.length;
            tableDepth = currentDepth;
        }

        // Count braces
        const openBraces = (line.match(/{/g) || []).length;
        const closeBraces = (line.match(/}/g) || []).length;

        // Check for note:
        if (tableDepth !== -1 && currentDepth === tableDepth + 1 && trimmed.startsWith('note:')) {
             // Found a table note
            const noteContent = trimmed.substring(5).trim();
            
            if (currentTableLineIndex !== -1) {
                let tableLine = processedLines[currentTableLineIndex] || "";
                if (tableLine.includes('[')) {
                    const lastBracket = tableLine.lastIndexOf(']');
                    tableLine = tableLine.substring(0, lastBracket) + `, note: ${noteContent}` + tableLine.substring(lastBracket);
                } else {
                    const braceIndex = tableLine.indexOf('{');
                    if (braceIndex !== -1) {
                        tableLine = tableLine.substring(0, braceIndex) + `[note: ${noteContent}] ` + tableLine.substring(braceIndex);
                    } else {
                        tableLine += ` [note: ${noteContent}]`;
                    }
                }
                processedLines[currentTableLineIndex] = tableLine;
            }
            // Do not push the note line
        } else {
            processedLines.push(line);
        }

        // Update depth
        currentDepth += openBraces - closeBraces;
        
        // Check if we exited table
        if (tableDepth !== -1 && currentDepth <= tableDepth) {
            tableDepth = -1;
            currentTableLineIndex = -1;
        }
    }
    return removeEmptyIndexesBlocks(processedLines.join('\n'));
}

function removeEmptyIndexesBlocks(content: string): string {
    const lines = content.split('\n');
    const processedLines: string[] = [];

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] || "";

        // @dbml/core requires at least one index definition inside this block.
        if (/^\s*Indexes\s*\{\s*\}\s*$/.test(line)) {
            processedLines.push("");
            continue;
        }

        if (/^\s*Indexes\s*\{\s*$/.test(line)) {
            let closingIndex = index + 1;
            while (closingIndex < lines.length && /^\s*$/.test(lines[closingIndex] || "")) {
                closingIndex += 1;
            }

            if (closingIndex < lines.length && /^\s*\}\s*$/.test(lines[closingIndex] || "")) {
                // Keep the original number of lines for useful parser locations.
                while (index <= closingIndex) {
                    processedLines.push("");
                    index += 1;
                }
                index -= 1;
                continue;
            }
        }

        processedLines.push(line);
    }

    return processedLines.join('\n');
}
