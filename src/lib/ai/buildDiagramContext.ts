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
}

export function buildDiagramContext(
  data: Diagram["data"],
  dbType: Diagram["dbType"],
  selectedNodeId: string | null,
  selectedEdgeId: string | null,
  /** Pinned tables from "Chat with AI" — adds scope + neighbor union to the payload. */
  aiChatPinnedTableIds?: string[] | null,
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

  return {
    dbType,
    selectedNodeId,
    selectedEdgeId,
    editorFocus,
    tables,
    relationships,
    aiChatTarget,
  };
}

export function diagramContextToPromptJson(ctx: DiagramContextPayload): string {
  return JSON.stringify(ctx, null, 2);
}
