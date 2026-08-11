import type { Diagram } from "@/lib/types";

export interface DiagramContextPayload {
  dbType: Diagram["dbType"];
  /** Table node id when a table is selected, else null. */
  selectedNodeId: string | null;
  /** Relationship edge id when selected, else null. */
  selectedEdgeId: string | null;
  /** Human-readable hint for what the user is focused on in the editor. */
  editorFocus: string | null;
  tables: {
    id: string;
    label: string;
    comment?: string;
    columns: {
      id: string;
      name: string;
      type: string;
      pk?: boolean;
      nullable?: boolean;
      comment?: string;
      defaultValue?: string | number | boolean | null;
      isUnique?: boolean;
      isAutoIncrement?: boolean;
    }[];
    indices: {
      id: string;
      name: string;
      columns: string[];
      columnIds: string[];
      isUnique?: boolean;
      type?: string;
    }[];
  }[];
  relationships: {
    id: string;
    sourceTableId: string;
    targetTableId: string;
    sourceHandle: string;
    targetHandle: string;
    relationship: string;
  }[];
  /** Set when the user pins one or more tables from "Chat with AI". Null if not pinned. */
  aiChatTarget: {
    primaryTableIds: string[];
    primaryLabels: string[];
    /** Direct neighbors on the diagram of any primary, excluding primary ids. */
    associatedTableIds: string[];
    associatedTableLabels: string[];
  } | null;
  contextStats: {
    totalTables: number;
    includedTables: number;
    estimatedTokens: number;
    sourceEstimatedTokens: number;
    maxCharacters: number;
    truncated: boolean;
  };
}

type DiagramContextOptions = {
  maxCharacters?: number;
  focusText?: string;
};

function searchKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim();
}

export function buildDiagramContext(
  data: Diagram["data"],
  dbType: Diagram["dbType"],
  selectedNodeId: string | null,
  selectedEdgeId: string | null,
  /** Pinned tables from "Chat with AI" — adds scope + neighbor union to the payload. */
  aiChatPinnedTableIds?: string[] | null,
  options: DiagramContextOptions = {},
): DiagramContextPayload {
  const tables = (data.nodes ?? [])
    .filter((n) => n.type === "table" && !n.data.isDeleted)
    .map((n) => ({
      id: n.id,
      label: n.data.label,
      ...(n.data.comment ? { comment: n.data.comment } : {}),
      columns: (n.data.columns ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        ...(c.pk !== undefined ? { pk: c.pk } : {}),
        ...(c.nullable !== undefined ? { nullable: c.nullable } : {}),
        ...(c.comment ? { comment: c.comment } : {}),
        ...(c.defaultValue !== undefined ? { defaultValue: c.defaultValue } : {}),
        ...(c.isUnique !== undefined ? { isUnique: c.isUnique } : {}),
        ...(c.isAutoIncrement !== undefined
          ? { isAutoIncrement: c.isAutoIncrement }
          : {}),
      })),
      indices: (n.data.indices ?? []).map((index) => ({
        id: index.id,
        name: index.name,
        columns: index.columns.map(
          (columnId) => n.data.columns?.find((column) => column.id === columnId)?.name ?? columnId,
        ),
        columnIds: index.columns,
        ...(index.isUnique !== undefined ? { isUnique: index.isUnique } : {}),
        ...(index.type !== undefined ? { type: index.type } : {}),
      })),
    }));

  const relationships = (data.edges ?? []).map((e) => ({
    id: e.id,
    sourceTableId: e.source,
    targetTableId: e.target,
    sourceHandle: e.sourceHandle ?? "",
    targetHandle: e.targetHandle ?? "",
    relationship: e.data?.relationship ?? "one-to-many",
  }));

  const tableById = new Map(tables.map((t) => [t.id, t]));
  const focusParts: string[] = [];

  let aiChatTarget: DiagramContextPayload["aiChatTarget"] = null;
  const rawPins = aiChatPinnedTableIds?.length ? aiChatPinnedTableIds : [];
  const primaryTableIds: string[] = [];
  const pinSeen = new Set<string>();
  for (const id of rawPins) {
    if (!tableById.has(id) || pinSeen.has(id)) continue;
    pinSeen.add(id);
    primaryTableIds.push(id);
  }

  if (primaryTableIds.length > 0) {
    const primarySet = new Set(primaryTableIds);
    const primaryLabels = primaryTableIds.map(
      (id) => tableById.get(id)!.label,
    );
    const assocIds = new Set<string>();
    for (const pid of primaryTableIds) {
      for (const e of data.edges ?? []) {
        if (e.source === pid) assocIds.add(e.target);
        if (e.target === pid) assocIds.add(e.source);
      }
    }
    const associatedTableIds = [...assocIds]
      .filter((id) => !primarySet.has(id))
      .sort();
    const associatedTableLabels = associatedTableIds.map(
      (id) => tableById.get(id)?.label ?? id,
    );
    aiChatTarget = {
      primaryTableIds,
      primaryLabels,
      associatedTableIds,
      associatedTableLabels,
    };
    const primaryPhrase = primaryLabels.map((l) => `"${l}"`).join(", ");
    const assocPhrase =
      associatedTableLabels.length > 0
        ? associatedTableLabels.map((l) => `"${l}"`).join(", ")
        : "none yet (no other tables linked on the diagram)";
    focusParts.push(
      `AI chat scope: primary tables ${primaryPhrase} (tableIds ${primaryTableIds.join(", ")}). Associated tables are direct neighbors not in the primary set—when the request affects FKs, types, names, or cardinality, keep this subgraph consistent: ${assocPhrase}.`,
    );
  }

  if (selectedNodeId) {
    const t = tableById.get(selectedNodeId);
    if (t) {
      focusParts.push(
        `Selected table: "${t.label}" (use tableId "${selectedNodeId}" in operations).`,
      );
    } else {
      focusParts.push(
        `selectedNodeId is "${selectedNodeId}" (not a visible table id — user may have a note/zone selected or soft-deleted table).`,
      );
    }
  }
  if (selectedEdgeId) {
    const r = relationships.find((x) => x.id === selectedEdgeId);
    if (r) {
      const from = tableById.get(r.sourceTableId)?.label ?? r.sourceTableId;
      const to = tableById.get(r.targetTableId)?.label ?? r.targetTableId;
      focusParts.push(
        `Selected relationship: "${from}" → "${to}" (${r.relationship}), edgeId "${r.id}".`,
      );
    } else {
      focusParts.push(
        `selectedEdgeId "${selectedEdgeId}" not found on current diagram.`,
      );
    }
  }
  const editorFocus = focusParts.length > 0 ? focusParts.join(" ") : null;

  const maxCharacters = options.maxCharacters ?? 24000;
  const basePayload = {
    dbType,
    selectedNodeId,
    selectedEdgeId,
    editorFocus,
    tables,
    relationships,
    aiChatTarget,
  };

  const fullJsonLength = JSON.stringify(basePayload).length;
  if (fullJsonLength <= maxCharacters) {
    return {
      ...basePayload,
      contextStats: {
        totalTables: tables.length,
        includedTables: tables.length,
        estimatedTokens: Math.ceil(fullJsonLength / 4),
        sourceEstimatedTokens: Math.ceil(fullJsonLength / 4),
        maxCharacters,
        truncated: false,
      },
    };
  }

  const priorityIds = new Set<string>([
    ...(aiChatTarget?.primaryTableIds ?? []),
    ...(aiChatTarget?.associatedTableIds ?? []),
    ...(selectedNodeId ? [selectedNodeId] : []),
  ]);
  const focusKey = searchKey(options.focusText ?? "");
  const focusTokens = focusKey.split(" ").filter((token) => token.length >= 3);
  if (focusKey) {
    for (const table of tables) {
      const tableKey = searchKey(table.label);
      const columnKeys = table.columns.map((column) => searchKey(column.name));
      const indexKeys = table.indices.map((index) => searchKey(index.name));
      if (
        focusKey.includes(tableKey) ||
        tableKey.includes(focusKey) ||
        focusTokens.some((token) => tableKey.includes(token)) ||
        columnKeys.some((key) => focusKey.includes(key) || key.includes(focusKey)) ||
        columnKeys.some((key) => focusTokens.some((token) => key.includes(token))) ||
        indexKeys.some((key) => focusKey.includes(key) || key.includes(focusKey))
      ) {
        priorityIds.add(table.id);
      }
    }
  }
  const orderedTables = [...tables].sort(
    (a, b) => Number(priorityIds.has(b.id)) - Number(priorityIds.has(a.id)),
  );
  const selectedTables: DiagramContextPayload["tables"] = [];
  const compactTables: DiagramContextPayload["tables"] = [];

  for (const table of orderedTables) {
    if (priorityIds.has(table.id)) {
      selectedTables.push(table);
      continue;
    }
    compactTables.push({
      id: table.id,
      label: table.label,
      columns: table.columns.map((column) => ({
        id: column.id,
        name: column.name,
        type: column.type,
        ...(column.pk !== undefined ? { pk: column.pk } : {}),
        ...(column.nullable !== undefined ? { nullable: column.nullable } : {}),
      })),
      indices: table.indices.map((index) => ({
        id: index.id,
        name: index.name,
        columns: index.columns,
        columnIds: index.columnIds,
        ...(index.isUnique !== undefined ? { isUnique: index.isUnique } : {}),
        ...(index.type !== undefined ? { type: index.type } : {}),
      })),
    });
  }

  const compactPayload = () => ({
    ...basePayload,
    tables: [...selectedTables, ...compactTables],
  });
  while (compactTables.length > 0 && JSON.stringify(compactPayload()).length > maxCharacters) {
    compactTables.pop();
  }

  const trimmedPayload = compactPayload();
  const trimmedJsonLength = JSON.stringify(trimmedPayload).length;
  return {
    ...trimmedPayload,
    contextStats: {
      totalTables: tables.length,
      includedTables: trimmedPayload.tables.length,
      estimatedTokens: Math.ceil(trimmedJsonLength / 4),
      sourceEstimatedTokens: Math.ceil(fullJsonLength / 4),
      maxCharacters,
      truncated: true,
    },
  };
}

export function diagramContextToPromptJson(ctx: DiagramContextPayload): string {
  return JSON.stringify(ctx);
}
