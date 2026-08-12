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
  | { ok: true; data: Diagram["data"]; appliedOperations: number }
  | {
      ok: false;
      error: string;
      operationIndex: number;
      operation: AiOperation;
      appliedOperations: number;
    };

type ApplyOneResult =
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

function resolveIndexRef(node: AppNode, ref: string): Index | undefined {
  const r = ref.trim();
  if (!r) return undefined;
  const indices = node.data.indices ?? [];
  const byId = indices.find((index) => index.id === r);
  if (byId) return byId;
  const key = normalizeRef(r);
  return indices.find((index) => normalizeRef(index.name) === key);
}

function columnNameTaken(
  columns: Column[],
  name: string,
  exceptId?: string,
): boolean {
  const key = normalizeRef(name);
  return columns.some(
    (column) => column.id !== exceptId && normalizeRef(column.name) === key,
  );
}

function edgeTouchesColumn(edge: AppEdge, tableId: string, columnId: string): boolean {
  const sourceHandle = edge.sourceHandle ?? "";
  const targetHandle = edge.targetHandle ?? "";
  const sourceColumns = edge.data?.sourceColumns ?? [];
  const targetColumns = edge.data?.targetColumns ?? [];
  return (
    (edge.source === tableId &&
      (sourceHandle.startsWith(`${columnId}-`) || sourceColumns.includes(columnId))) ||
    (edge.target === tableId &&
      (targetHandle.startsWith(`${columnId}-`) || targetColumns.includes(columnId)))
  );
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
  const ids = new Set(columns.map((c) => c.id));
  const next = indices.filter((idx) =>
    idx.columns.every((columnId) => ids.has(columnId)),
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
  if (inp.comment !== undefined) {
    if (inp.comment === null) delete col.comment;
    else col.comment = inp.comment;
  }
  if (inp.enumValues !== undefined) {
    if (inp.enumValues === null) delete col.enumValues;
    else col.enumValues = inp.enumValues;
  }
  if (inp.length !== undefined) {
    if (inp.length === null) delete col.length;
    else col.length = inp.length;
  }
  else if (parsed.length !== undefined) col.length = parsed.length;
  if (inp.precision !== undefined) {
    if (inp.precision === null) delete col.precision;
    else col.precision = inp.precision;
  }
  else if (parsed.precision !== undefined) col.precision = parsed.precision;
  if (inp.scale !== undefined) {
    if (inp.scale === null) delete col.scale;
    else col.scale = inp.scale;
  }
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
): ApplyOneResult {
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
      if (columnNameTaken(cols, r.column.name)) {
        return { ok: false, error: `Duplicate column name "${r.column.name}".` };
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
        if (columnNameTaken(nextCols, r.column.name)) {
          return { ok: false, error: `Duplicate column name "${r.column.name}".` };
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

  if (op.op === "add_column") {
    const nodes = [...((draft.nodes ?? []) as AppNode[])];
    const resolved = resolveTableNode(draft, op.tableId);
    if (!resolved) {
      return { ok: false, error: `Unknown table "${op.tableId}".` };
    }
    const idx = nodes.findIndex((node) => node.id === resolved.id);
    const node = idx >= 0 ? nodes[idx] : undefined;
    if (!node) return { ok: false, error: `Unknown table "${op.tableId}".` };

    const columns = node.data.columns ?? [];
    if (op.column.id && columns.some((column) => column.id === op.column.id)) {
      return { ok: false, error: `Column id "${op.column.id}" already exists.` };
    }
    if (columnNameTaken(columns, op.column.name)) {
      return { ok: false, error: `Column name "${op.column.name}" already exists.` };
    }
    const result = columnFromInput(op.column, dbType, undefined, {
      allowAdhocId: true,
    });
    if (!result.ok) return result;
    nodes[idx] = {
      ...node,
      data: { ...node.data, columns: [...columns, result.column] },
    };
    return { ok: true, data: { ...draft, nodes } };
  }

  if (op.op === "update_column") {
    const nodes = [...((draft.nodes ?? []) as AppNode[])];
    const resolved = resolveTableNode(draft, op.tableId);
    if (!resolved) {
      return { ok: false, error: `Unknown table "${op.tableId}".` };
    }
    const idx = nodes.findIndex((node) => node.id === resolved.id);
    const node = idx >= 0 ? nodes[idx] : undefined;
    if (!node) return { ok: false, error: `Unknown table "${op.tableId}".` };
    const columns = node.data.columns ?? [];
    const column = resolveColumnRef(node, op.columnId);
    if (!column) {
      return {
        ok: false,
        error: `Unknown column "${op.columnId}" on table "${node.data.label}".`,
      };
    }
    const changes = op.changes;
    if (changes.name && columnNameTaken(columns, changes.name, column.id)) {
      return { ok: false, error: `Column name "${changes.name}" already exists.` };
    }
    const result = columnFromInput(
      {
        ...column,
        ...changes,
        id: column.id,
        name: changes.name ?? column.name,
        type: changes.type ?? column.type,
      },
      dbType,
      column,
      { allowAdhocId: false },
    );
    if (!result.ok) return result;
    nodes[idx] = {
      ...node,
      data: {
        ...node.data,
        columns: columns.map((current) =>
          current.id === column.id ? result.column : current,
        ),
      },
    };
    return { ok: true, data: { ...draft, nodes } };
  }

  if (op.op === "delete_column") {
    const nodes = [...((draft.nodes ?? []) as AppNode[])];
    const resolved = resolveTableNode(draft, op.tableId);
    if (!resolved) {
      return { ok: false, error: `Unknown table "${op.tableId}".` };
    }
    const idx = nodes.findIndex((node) => node.id === resolved.id);
    const node = idx >= 0 ? nodes[idx] : undefined;
    if (!node) return { ok: false, error: `Unknown table "${op.tableId}".` };
    const column = resolveColumnRef(node, op.columnId);
    if (!column) {
      return {
        ok: false,
        error: `Unknown column "${op.columnId}" on table "${node.data.label}".`,
      };
    }
    const columns = node.data.columns ?? [];
    if (columns.length <= 1) {
      return { ok: false, error: "A table must have at least one column." };
    }
    if ((draft.edges ?? []).some((edge) => edgeTouchesColumn(edge, node.id, column.id))) {
      return {
        ok: false,
        error: `Column "${column.name}" is used by a relationship. Delete that relationship first.`,
      };
    }
    const nextColumns = columns.filter((current) => current.id !== column.id);
    const nextIndices = (node.data.indices ?? [])
      .map((index) => ({
        ...index,
        columns: index.columns.filter((columnId) => columnId !== column.id),
      }))
      .filter((index) => index.columns.length > 0);
    const nextData = {
      ...node.data,
      columns: nextColumns,
    };
    if (nextIndices.length > 0) {
      nextData.indices = nextIndices;
    } else {
      delete nextData.indices;
    }
    nodes[idx] = {
      ...node,
      data: nextData,
    };
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

  if (op.op === "update_relationship") {
    const edges = draft.edges ?? [];
    const edge = edges.find((current) => current.id === op.edgeId);
    if (!edge) {
      return { ok: false, error: `Unknown relationship "${op.edgeId}".` };
    }
    return {
      ok: true,
      data: {
        ...draft,
        edges: edges.map((current) =>
          current.id === op.edgeId
            ? { ...current, data: { ...current.data, relationship: op.relationshipType } }
            : current,
        ),
      },
    };
  }

  if (op.op === "create_index") {
    const nodes = [...((draft.nodes ?? []) as AppNode[])];
    const resolved = resolveTableNode(draft, op.tableId);
    if (!resolved) {
      return { ok: false, error: `Unknown table "${op.tableId}".` };
    }
    const idx = nodes.findIndex((node) => node.id === resolved.id);
    const node = idx >= 0 ? nodes[idx] : undefined;
    if (!node) return { ok: false, error: `Unknown table "${op.tableId}".` };
    if ((node.data.indices ?? []).some((index) => normalizeRef(index.name) === normalizeRef(op.name))) {
      return { ok: false, error: `Index name "${op.name}" already exists.` };
    }
    const columnIds: string[] = [];
    for (const columnRef of op.columns) {
      const column = resolveColumnRef(node, columnRef);
      if (!column) {
        return {
          ok: false,
          error: `Unknown index column "${columnRef}" on table "${node.data.label}".`,
        };
      }
      if (columnIds.includes(column.id)) {
        return { ok: false, error: `Index contains duplicate column "${column.name}".` };
      }
      columnIds.push(column.id);
    }
    const index: Index = {
      id: `idx_${uuid()}`,
      name: op.name.trim(),
      columns: columnIds,
      ...(op.isUnique !== undefined ? { isUnique: op.isUnique } : {}),
      ...(op.type !== undefined ? { type: op.type } : {}),
    };
    const nextData = {
      ...node.data,
      indices: [...(node.data.indices ?? []), index],
    };
    nodes[idx] = {
      ...node,
      data: nextData,
    };
    return { ok: true, data: { ...draft, nodes } };
  }

  if (op.op === "update_index") {
    const nodes = [...((draft.nodes ?? []) as AppNode[])];
    const resolved = resolveTableNode(draft, op.tableId);
    if (!resolved) {
      return { ok: false, error: `Unknown table "${op.tableId}".` };
    }
    const nodeIndex = nodes.findIndex((node) => node.id === resolved.id);
    const node = nodeIndex >= 0 ? nodes[nodeIndex] : undefined;
    if (!node) return { ok: false, error: `Unknown table "${op.tableId}".` };
    const current = resolveIndexRef(node, op.indexId);
    if (!current) {
      return {
        ok: false,
        error: `Unknown index "${op.indexId}" on table "${node.data.label}".`,
      };
    }
    const nextName = op.name;
    if (
      nextName &&
      (node.data.indices ?? []).some(
        (index) =>
          index.id !== current.id && normalizeRef(index.name) === normalizeRef(nextName),
      )
    ) {
      return { ok: false, error: `Index name "${op.name}" already exists.` };
    }
    let columnIds = current.columns;
    if (op.columns) {
      columnIds = [];
      for (const columnRef of op.columns) {
        const column = resolveColumnRef(node, columnRef);
        if (!column) {
          return {
            ok: false,
            error: `Unknown index column "${columnRef}" on table "${node.data.label}".`,
          };
        }
        if (columnIds.includes(column.id)) {
          return { ok: false, error: `Index contains duplicate column "${column.name}".` };
        }
        columnIds.push(column.id);
      }
    }
    const updatedIndex: Index = {
      ...current,
      ...(op.name !== undefined ? { name: op.name.trim() } : {}),
      columns: columnIds,
      ...(op.isUnique !== undefined ? { isUnique: op.isUnique } : {}),
      ...(op.type !== undefined ? { type: op.type } : {}),
    };
    nodes[nodeIndex] = {
      ...node,
      data: {
        ...node.data,
        indices: (node.data.indices ?? []).map((index) =>
          index.id === current.id ? updatedIndex : index,
        ),
      },
    };
    return { ok: true, data: { ...draft, nodes } };
  }

  if (op.op === "delete_index") {
    const nodes = [...((draft.nodes ?? []) as AppNode[])];
    const resolved = resolveTableNode(draft, op.tableId);
    if (!resolved) {
      return { ok: false, error: `Unknown table "${op.tableId}".` };
    }
    const idx = nodes.findIndex((node) => node.id === resolved.id);
    const node = idx >= 0 ? nodes[idx] : undefined;
    if (!node) return { ok: false, error: `Unknown table "${op.tableId}".` };
    const index = resolveIndexRef(node, op.indexId);
    if (!index) {
      return {
        ok: false,
        error: `Unknown index "${op.indexId}" on table "${node.data.label}".`,
      };
    }
    const nextIndices = (node.data.indices ?? []).filter(
      (current) => current.id !== index.id,
    );
    nodes[idx] = {
      ...node,
      data: {
        ...node.data,
        ...(nextIndices.length ? { indices: nextIndices } : {}),
      },
    };
    return { ok: true, data: { ...draft, nodes } };
  }

  return { ok: false, error: "Unsupported operation." };
}

export function simulateAiPatch(
  data: Diagram["data"],
  dbType: DatabaseType,
  operations: AiOperation[],
): SimulateAiResult {
  let draft = cloneData(data);

  for (const [operationIndex, op] of operations.entries()) {
    const res = applyOneOp(draft, dbType, op);
    if (!res.ok) {
      return {
        ok: false,
        error: res.error,
        operationIndex,
        operation: op,
        appliedOperations: operationIndex,
      };
    }
    draft = res.data;
  }

  return { ok: true, data: draft, appliedOperations: operations.length };
}
