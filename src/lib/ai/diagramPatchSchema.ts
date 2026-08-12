import { z } from "zod";

const indexTypeEnum = z.enum(["INDEX", "UNIQUE", "FULLTEXT", "SPATIAL"]);

const relationshipTypeEnum = z.enum([
  "one-to-one",
  "one-to-many",
  "many-to-one",
  "many-to-many",
]);

export const columnInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  type: z.string().min(1),
  pk: z.boolean().optional(),
  nullable: z.boolean().optional(),
  defaultValue: z
    .union([z.string(), z.number(), z.boolean(), z.null()])
    .optional(),
  isUnique: z.boolean().optional(),
  isAutoIncrement: z.boolean().optional(),
  comment: z.string().nullable().optional(),
  enumValues: z.string().nullable().optional(),
  length: z.number().nullable().optional(),
  precision: z.number().nullable().optional(),
  scale: z.number().nullable().optional(),
  isUnsigned: z.boolean().optional(),
}).strict();

export const columnChangesSchema = z
  .object({
    name: z.string().min(1).optional(),
    type: z.string().min(1).optional(),
    pk: z.boolean().optional(),
    nullable: z.boolean().optional(),
    defaultValue: z
      .union([z.string(), z.number(), z.boolean(), z.null()])
      .optional(),
    isUnique: z.boolean().optional(),
    isAutoIncrement: z.boolean().optional(),
    comment: z.string().nullable().optional(),
    enumValues: z.string().nullable().optional(),
    length: z.number().nullable().optional(),
    precision: z.number().nullable().optional(),
    scale: z.number().nullable().optional(),
    isUnsigned: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one column change is required.",
  });

const indexColumnsSchema = z.array(z.string().min(1)).min(1);

export const aiOperationSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("create_table"),
    label: z.string().min(1),
    columns: z.array(columnInputSchema).min(1),
    position: z
      .object({ x: z.number(), y: z.number() })
      .optional(),
  }).strict(),
  z.object({
    op: z.literal("update_table"),
    tableId: z.string().min(1),
    label: z.string().min(1).optional(),
    columns: z.array(columnInputSchema).min(1).optional(),
    comment: z.string().nullable().optional(),
  }),
  z.object({
    op: z.literal("add_column"),
    tableId: z.string().min(1),
    column: columnInputSchema,
  }),
  z.object({
    op: z.literal("update_column"),
    tableId: z.string().min(1),
    columnId: z.string().min(1),
    changes: columnChangesSchema,
  }),
  z.object({
    op: z.literal("delete_column"),
    tableId: z.string().min(1),
    columnId: z.string().min(1),
  }),
  z.object({
    op: z.literal("delete_table"),
    tableId: z.string().min(1),
  }),
  z.object({
    op: z.literal("create_relationship"),
    sourceTableId: z.string().min(1),
    sourceColumnId: z.string().min(1),
    targetTableId: z.string().min(1),
    targetColumnId: z.string().min(1),
    relationshipType: relationshipTypeEnum,
  }),
  z.object({
    op: z.literal("delete_relationship"),
    edgeId: z.string().min(1),
  }),
  z.object({
    op: z.literal("update_relationship"),
    edgeId: z.string().min(1),
    relationshipType: relationshipTypeEnum,
  }),
  z.object({
    op: z.literal("create_index"),
    tableId: z.string().min(1),
    name: z.string().min(1),
    columns: indexColumnsSchema,
    isUnique: z.boolean().optional(),
    type: indexTypeEnum.optional(),
  }),
  z.object({
    op: z.literal("update_index"),
    tableId: z.string().min(1),
    indexId: z.string().min(1),
    name: z.string().min(1).optional(),
    columns: indexColumnsSchema.optional(),
    isUnique: z.boolean().optional(),
    type: indexTypeEnum.optional(),
  }),
  z.object({
    op: z.literal("delete_index"),
    tableId: z.string().min(1),
    indexId: z.string().min(1),
  }),
]);

export const aiPatchSchema = z.object({
  summary: z.string(),
  operations: z.array(aiOperationSchema).max(50),
});

export type AiPatch = z.infer<typeof aiPatchSchema>;
export type AiOperation = z.infer<typeof aiOperationSchema>;
export type ColumnInput = z.infer<typeof columnInputSchema>;
