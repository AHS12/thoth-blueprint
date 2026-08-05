export const AI_PATCH_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    operations: {
      type: "array",
      items: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["op", "label", "columns"],
            properties: {
              op: { const: "create_table" },
              label: { type: "string" },
              columns: { type: "array", items: { $ref: "#/$defs/column" }, minItems: 1 },
              position: {
                type: "object",
                additionalProperties: false,
                required: ["x", "y"],
                properties: { x: { type: "number" }, y: { type: "number" } },
              },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["op", "tableId"],
            properties: {
              op: { const: "update_table" },
              tableId: { type: "string" },
              label: { type: "string" },
              columns: { type: "array", items: { $ref: "#/$defs/column" }, minItems: 1 },
              comment: { type: ["string", "null"] },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["op", "tableId"],
            properties: {
              op: { const: "delete_table" },
              tableId: { type: "string" },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: [
              "op",
              "sourceTableId",
              "sourceColumnId",
              "targetTableId",
              "targetColumnId",
              "relationshipType",
            ],
            properties: {
              op: { const: "create_relationship" },
              sourceTableId: { type: "string" },
              sourceColumnId: { type: "string" },
              targetTableId: { type: "string" },
              targetColumnId: { type: "string" },
              relationshipType: {
                enum: ["one-to-one", "one-to-many", "many-to-one", "many-to-many"],
              },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["op", "edgeId"],
            properties: {
              op: { const: "delete_relationship" },
              edgeId: { type: "string" },
            },
          },
        ],
      },
    },
  },
  required: ["summary", "operations"],
  $defs: {
    column: {
      type: "object",
      additionalProperties: false,
      required: ["name", "type"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        type: { type: "string" },
        pk: { type: "boolean" },
        nullable: { type: "boolean" },
        defaultValue: { type: ["string", "number", "boolean", "null"] },
        isUnique: { type: "boolean" },
        isAutoIncrement: { type: "boolean" },
        comment: { type: "string" },
        enumValues: { type: "string" },
        length: { type: "number" },
        precision: { type: "number" },
        scale: { type: "number" },
        isUnsigned: { type: "boolean" },
      },
    },
  },
} as const;
