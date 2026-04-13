import { z } from "zod";

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
  comment: z.string().optional(),
  enumValues: z.string().optional(),
  length: z.number().optional(),
  precision: z.number().optional(),
  scale: z.number().optional(),
  isUnsigned: z.boolean().optional(),
});

export const aiOperationSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("create_table"),
    label: z.string().min(1),
    columns: z.array(columnInputSchema).min(1),
    position: z
      .object({ x: z.number(), y: z.number() })
      .optional(),
  }),
  z.object({
    op: z.literal("update_table"),
    tableId: z.string().min(1),
    label: z.string().min(1).optional(),
    columns: z.array(columnInputSchema).min(1).optional(),
    comment: z.string().nullable().optional(),
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
]);

export const aiPatchSchema = z.object({
  summary: z.string().optional(),
  operations: z.array(aiOperationSchema),
});

export type AiPatch = z.infer<typeof aiPatchSchema>;
export type AiOperation = z.infer<typeof aiOperationSchema>;
export type ColumnInput = z.infer<typeof columnInputSchema>;
