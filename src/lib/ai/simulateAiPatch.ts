import { colors } from "@/lib/constants";
import { tableColors } from "@/lib/colors";
import type {
  AppEdge,
  AppNode,
  Column,
  CombinedNode,
  DatabaseType,
  Diagram,
  Index,
} from "@/lib/types";
import {
  DEFAULT_NODE_SPACING,
  DEFAULT_TABLE_HEIGHT,
  DEFAULT_TABLE_WIDTH,
  findExistingRelationship,
  findNonOverlappingPosition,
  uuid,
} from "@/lib/utils";
import type { AiOperation, ColumnInput } from "./diagramPatchSchema";
import { resolveCanonicalColumnType } from "./parseSqlColumnType";

export type SimulateAiResult =
  | { ok: true; data: Diagram["data"] }
  | { ok: false; error: string };

function cloneData(data: Diagram["data"]): Diagram["data"] {
  return JSON.parse(JSON.stringify(data)) as Diagram["data"];
}

function visibleTables(nodes: AppNode[] | undefined): AppNode[] {
  return (nodes ?? []).filter((n) => n.type === "table" && !n.data.isDeleted);
}

function tableColumns(node: AppNode): Column[] {
  return node.data.columns ?? [];
}

/** Normalize for case-insensitive label/name matching (AI often sends labels vs ids). */
function normalizeRef(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Resolve a table by exact node id or by table label (visible, non-deleted). */
function resolveTableNode(
  draft: Diagram["data"],
  ref: string,
): AppNode | undefined {
  const r = ref.trim();
  if (!r) return undefined;
  const visible = visibleTables((draft.nodes ?? []) as AppNode[]);
  const byId = visible.find((n) => n.id === r);
  if (byId) return byId;
  const key = normalizeRef(r);
  return visible.find((n) => normalizeRef(n.data.label) === key);
}

/** Resolve a column by id or by column name on the given table. */
function resolveColumnRef(node: AppNode, ref: string): Column | undefined {
  const r = ref.trim();
  if (!r) return undefined;
  const cols = tableColumns(node);
  const byId = cols.find((c) => c.id === r);
  if (byId) return byId;
  const key = normalizeRef(r);
  return cols.find((c) => normalizeRef(c.name) === key);
}

function labelTaken(
  nodes: AppNode[] | undefined,
  label: string,
  exceptId?: string,
): boolean {
  const ln = label.trim().toLowerCase();
  return visibleTables(nodes).some(
    (n) =>
      n.id !== exceptId && n.data.label.trim().toLowerCase() === ln,
  );
}

function filterIndicesForColumns(
  indices: Index[] | undefined,
  columns: Column[],
): Index[] | undefined {
  if (!indices?.length) return indices;
  const names = new Set(columns.map((c) => c.name));
  const next = indices.filter((idx) =>
    idx.columns.every((cn) => names.has(cn)),
  );
  return next.length ? next : undefined;
}

function columnFromInput(
  inp: ColumnInput,
  dbType: DatabaseType,
  existing: Column | undefined,
  opts: { allowAdhocId: boolean },
): { ok: true; column: Column } | { ok: false; error: string } {
  const resolved = resolveCanonicalColumnType(dbType, inp.type);
  if (!resolved.ok) {
    return {
      ok: false,
      error: `Invalid column type "${inp.type}" for ${dbType}.`,
    };
  }
  const normType = resolved.canonical;
  const parsed = resolved.parsed;
  if (inp.id && !existing && !opts.allowAdhocId) {
    return { ok: false, error: `Unknown column id "${inp.id}".` };
  }
  const id =
    existing?.id ??
    (inp.id && opts.allowAdhocId ? inp.id : undefined) ??
    `col_${uuid()}`;

  const col: Column = {
    ...(existing ?? { id, name: inp.name, type: normType }),
    id,
    name: inp.name,
    type: normType,
    pk: inp.pk ?? existing?.pk ?? false,
    nullable:
      inp.nullable !== undefined
        ? inp.nullable
        : (existing?.nullable ?? true),
  };
  if (inp.defaultValue !== undefined) col.defaultValue = inp.defaultValue;
  if (inp.isUnique !== undefined) col.isUnique = inp.isUnique;
  if (inp.isAutoIncrement !== undefined)
    col.isAutoIncrement = inp.isAutoIncrement;
  if (inp.comment !== undefined) col.comment = inp.comment;
  if (inp.enumValues !== undefined) col.enumValues = inp.enumValues;
  if (inp.length !== undefined) col.length = inp.length;
  else if (parsed.length !== undefined) col.length = parsed.length;
  if (inp.precision !== undefined) col.precision = inp.precision;
  else if (parsed.precision !== undefined) col.precision = parsed.precision;
  if (inp.scale !== undefined) col.scale = inp.scale;
  else if (parsed.scale !== undefined) col.scale = parsed.scale;
  if (inp.isUnsigned !== undefined) col.isUnsigned = inp.isUnsigned;
  else if (parsed.isUnsigned) col.isUnsigned = true;

  return { ok: true, column: col };
}

function combinedNodesForLayout(draft: Diagram["data"]): CombinedNode[] {
  return [
    ...((draft.nodes ?? []) as CombinedNode[]),
    ...((draft.notes ?? []) as CombinedNode[]),
    ...((draft.zones ?? []) as CombinedNode[]),
  ];
}

function applyOneOp(
  draft: Diagram["data"],
  dbType: DatabaseType,
  op: AiOperation,
): SimulateAiResult {
  if (op.op === "create_table") {
    const nodes = (draft.nodes ?? []) as AppNode[];
    if (labelTaken(nodes, op.label)) {
      return {
        ok: false,
        error: `Table label "${op.label}" already exists.`,
      };
    }
    const cols: Column[] = [];
    const seenIds = new Set<string>();
    for (const inp of op.columns) {
      const r = columnFromInput(inp, dbType, undefined, { allowAdhocId: true });
      if (!r.ok) return r;
      if (seenIds.has(r.column.id)) {
        return { ok: false, error: `Duplicate column id ${r.column.id}.` };
      }
      seenIds.add(r.column.id);
      cols.push(r.column);
    }
    const visible = visibleTables(nodes);
    const tableLabelSafe = op.label.replace(/\s+/g, "_");
    const newId = `${tableLabelSafe}-${Date.now()}`;
    const defaultPos = op.position ?? {
      x: 200 + visible.length * 24,
      y: 200 + visible.length * 24,
    };
    const position = findNonOverlappingPosition(
      combinedNodesForLayout(draft),
      defaultPos,
      DEFAULT_TABLE_WIDTH,
      DEFAULT_TABLE_HEIGHT,
      DEFAULT_NODE_SPACING,
      undefined,
    );
    const newNode: AppNode = {
      id: newId,
      type: "table",
      position,
      data: {
        label: op.label.trim(),
        color:
          tableColors[Math.floor(Math.random() * tableColors.length)] ??
          colors.DEFAULT_TABLE_COLOR,
        columns: cols,
        order: visible.length,
      },
    };
    return {
      ok: true,
      data: {
        ...draft,
        nodes: [...nodes, newNode],
      },
    };
  }

  if (op.op === "update_table") {
    const nodes = [...((draft.nodes ?? []) as AppNode[])];
    const resolved = resolveTableNode(draft, op.tableId);
    if (!resolved) {
      return { ok: false, error: `Unknown table "${op.tableId}".` };
    }
    const idx = nodes.findIndex(
      (n) =>
        n.id === resolved.id && n.type === "table" && !n.data.isDeleted,
    );
    if (idx === -1) {
      return { ok: false, error: `Unknown table "${op.tableId}".` };
    }
    const node = nodes[idx]!;
    let label = node.data.label;
    if (op.label !== undefined) {
      const nl = op.label.trim();
      if (labelTaken(nodes, nl, node.id)) {
        return { ok: false, error: `Table label "${nl}" already exists.` };
      }
      label = nl;
    }
    let columns = node.data.columns ?? [];
    if (op.columns) {
      const existingById = new Map(columns.map((c) => [c.id, c]));
      const nextCols: Column[] = [];
      const seen = new Set<string>();
      for (const inp of op.columns) {
        const existing =
          inp.id !== undefined ? existingById.get(inp.id) : undefined;
        const allowAdhocId = inp.id !== undefined && !existing;
        const r = columnFromInput(inp, dbType, existing, {
          allowAdhocId,
        });
        if (!r.ok) return r;
        if (seen.has(r.column.id)) {
          return { ok: false, error: `Duplicate column id ${r.column.id}.` };
        }
        seen.add(r.column.id);
        nextCols.push(r.column);
      }
      if (nextCols.length === 0) {
        return { ok: false, error: "Table must have at least one column." };
      }
      columns = nextCols;
    }
    const {
      indices: prevIndices,
      comment: prevComment,
      ...dataRest
    } = node.data;
    let nextComment: string | undefined = prevComment;
    if (op.comment !== undefined) {
      nextComment = op.comment ?? undefined;
    }
    let nextIndices: Index[] | undefined = prevIndices;
    if (op.columns) {
      const fi = filterIndicesForColumns(prevIndices, columns);
      nextIndices = fi && fi.length > 0 ? fi : undefined;
    }
    const updated: AppNode = {
      ...node,
      data: {
        ...dataRest,
        label,
        columns,
        ...(nextComment !== undefined ? { comment: nextComment } : {}),
        ...(nextIndices?.length ? { indices: nextIndices } : {}),
      },
    };
    nodes[idx] = updated;
    return { ok: true, data: { ...draft, nodes } };
  }

  if (op.op === "delete_table") {
    const nodes = [...((draft.nodes ?? []) as AppNode[])];
    const resolved = resolveTableNode(draft, op.tableId);
    if (!resolved) {
      return { ok: false, error: `Unknown table "${op.tableId}".` };
    }
    const idx = nodes.findIndex(
      (n) =>
        n.id === resolved.id && n.type === "table" && !n.data.isDeleted,
    );
    if (idx === -1) {
      return { ok: false, error: `Unknown table "${op.tableId}".` };
    }
    const n = nodes[idx]!;
    nodes[idx] = {
      ...n,
      data: {
        ...n.data,
        isDeleted: true,
        deletedAt: new Date(),
      },
    };
    const edges = (draft.edges ?? []).filter(
      (e) => e.source !== n.id && e.target !== n.id,
    );
    return { ok: true, data: { ...draft, nodes, edges } };
  }

  if (op.op === "create_relationship") {
    const sourceNode = resolveTableNode(draft, op.sourceTableId);
    const targetNode = resolveTableNode(draft, op.targetTableId);
    if (!sourceNode || !targetNode) {
      return {
        ok: false,
        error:
          'Source or target table not found. Use tables[].id from the diagram or the table\'s "label" (e.g. after create_table in the same batch).',
      };
    }
    const sc = resolveColumnRef(sourceNode, op.sourceColumnId);
    const tc = resolveColumnRef(targetNode, op.targetColumnId);
    if (!sc || !tc) {
      return {
        ok: false,
        error:
          "Source or target column not found. Use columns[].id or the column name string.",
      };
    }
    if (sc.type !== tc.type) {
      return {
        ok: false,
        error: "Column types must match for a relationship.",
      };
    }
    const sourceHandle = `${sc.id}-right-source`;
    const targetHandle = `${tc.id}-left-target`;
    const edges = draft.edges ?? [];
    const existingEdge = findExistingRelationship(
      edges as AppEdge[],
      sourceNode.id,
      targetNode.id,
      sourceHandle,
      targetHandle,
    );
    if (existingEdge) {
      return { ok: false, error: "This relationship already exists." };
    }
    const newEdge: AppEdge = {
      id: `${sourceNode.id}-${targetNode.id}-${sourceHandle}-${targetHandle}`,
      source: sourceNode.id,
      target: targetNode.id,
      sourceHandle,
      targetHandle,
      type: "custom",
      data: { relationship: op.relationshipType },
    };
    return {
      ok: true,
      data: { ...draft, edges: [...edges, newEdge] },
    };
  }

  if (op.op === "delete_relationship") {
    const edges = draft.edges ?? [];
    if (!edges.some((e) => e.id === op.edgeId)) {
      return { ok: false, error: `Unknown relationship "${op.edgeId}".` };
    }
    return {
      ok: true,
      data: {
        ...draft,
        edges: edges.filter((e) => e.id !== op.edgeId),
      },
    };
  }

  return { ok: false, error: "Unsupported operation." };
}

export function simulateAiPatch(
  data: Diagram["data"],
  dbType: DatabaseType,
  operations: AiOperation[],
): SimulateAiResult {
  let draft = cloneData(data);

  for (const op of operations) {
    const res = applyOneOp(draft, dbType, op);
    if (!res.ok) return res;
    draft = res.data;
  }

  return { ok: true, data: draft };
}
