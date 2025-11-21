import { DEFAULT_SETTINGS } from "@/lib/constants";
import { db } from "@/lib/db";
import { organizeTablesByRelationshipsWithZones } from "@/lib/layout-algorithms";
import {
    Settings,
    type AppEdge,
    type AppNode,
    type AppNoteNode,
    type AppZoneNode,
    type DatabaseType,
    type Diagram,
} from "@/lib/types";
import {
    applyEdgeChanges,
    applyNodeChanges,
    type EdgeChange,
    type NodeChange,
} from "@xyflow/react";
import debounce from "lodash/debounce";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { shallow } from "zustand/shallow";

export interface StoreState {
  diagrams: Diagram[];
  diagramsMap: Map<number, Diagram>;
  selectedDiagramId: number | null;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  settings: Settings;
  isLoading: boolean;
  clipboard: (AppNode | AppNoteNode | AppZoneNode)[] | null;
  lastCursorPosition: { x: number; y: number } | null;
  isRelationshipDialogOpen: boolean;
  onlyRenderVisibleElements: boolean;
  loadInitialData: () => Promise<void>;
  setSelectedDiagramId: (id: number | null) => void;
  setSelectedNodeId: (id: string | null) => void;
  setSelectedEdgeId: (id: string | null) => void;
  setLastCursorPosition: (position: { x: number; y: number } | null) => void;
  updateSettings: (settings: Partial<Settings>) => void;
  createDiagram: (
    diagram: Omit<Diagram, "id" | "createdAt" | "updatedAt">
  ) => Promise<void>;
  importDiagram: (diagramData: {
    name: string;
    dbType: DatabaseType;
    data: Diagram["data"];
  }) => Promise<void>;
  renameDiagram: (id: number, name: string) => void;
  duplicateDiagram: (id: number) => Promise<void>;
  moveDiagramToTrash: (id: number) => void;
  restoreDiagram: (id: number) => void;
  permanentlyDeleteDiagram: (id: number) => void;
  updateCurrentDiagramData: (data: Partial<Diagram["data"]>) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  addEdge: (edge: AppEdge) => void;
  updateNode: (node: AppNode | AppNoteNode | AppZoneNode) => void;
  deleteNodes: (nodeIds: string[]) => void;
  updateEdge: (edge: AppEdge) => void;
  deleteEdge: (edgeId: string) => void;
  addNode: (node: AppNode | AppNoteNode | AppZoneNode) => void;
  undoDelete: () => void;
  batchUpdateNodes: (nodes: (AppNode | AppNoteNode | AppZoneNode)[]) => void;
  copyNodes: (nodes: (AppNode | AppNoteNode | AppZoneNode)[]) => void;
  pasteNodes: (position: { x: number; y: number }) => void;
  setIsRelationshipDialogOpen: (value: boolean) => void;
  setOnlyRenderVisibleElements: (value: boolean) => void;
  reorganizeTables: () => void;
  toggleLock: () => void;
}

export const TABLE_SOFT_DELETE_LIMIT = 10;

// Helper function to create diagrams map from array
function createDiagramsMap(diagrams: Diagram[]): Map<number, Diagram> {
  return new Map(diagrams.map(diagram => [diagram.id!, diagram]));
}

// Helper function to get diagram by ID with O(1) lookup
function getDiagramById(diagramsMap: Map<number, Diagram>, id: number | null): Diagram | undefined {
  return id ? diagramsMap.get(id) : undefined;
}

// Helper function to update diagrams and maintain map consistency
function updateDiagramsWithMap(
  diagrams: Diagram[], 
  updater: (diagrams: Diagram[]) => Diagram[]
): { diagrams: Diagram[]; diagramsMap: Map<number, Diagram> } {
  const updatedDiagrams = updater(diagrams);
  return {
    diagrams: updatedDiagrams,
    diagramsMap: createDiagramsMap(updatedDiagrams),
  };
}

let previousDiagrams: Diagram[] = [];
let previousSelectedDiagramId: number | null = null;

const debouncedSavePositions = debounce(
  async (diagrams: Diagram[], selectedDiagramId: number | null) => {
    try {
      const diagramsMap = createDiagramsMap(diagrams);
      const previousDiagramsMap = createDiagramsMap(previousDiagrams);
      
      const currentDiagram = getDiagramById(diagramsMap, selectedDiagramId);
      const previousDiagram = getDiagramById(previousDiagramsMap, previousSelectedDiagramId);

      if (!currentDiagram || !previousDiagram) {
        await debouncedSaveFull(diagrams, selectedDiagramId);
        return;
      }

      const onlyPositionsChanged =
        checkIfOnlyPositionsChanged(
          currentDiagram.data.nodes || [],
          previousDiagram.data.nodes || []
        ) &&
        checkIfOnlyPositionsChanged(
          currentDiagram.data.notes || [],
          previousDiagram.data.notes || []
        ) &&
        checkIfOnlyPositionsChanged(
          currentDiagram.data.zones || [],
          previousDiagram.data.zones || []
        );

      if (onlyPositionsChanged) {
        // Use partial updates for position-only changes
        await savePositionChanges(currentDiagram, previousDiagram);
      } else {
        await debouncedSaveFull(diagrams, selectedDiagramId);
      }

      previousDiagrams = diagrams;
      previousSelectedDiagramId = selectedDiagramId;
    } catch (error) {
      console.error("Failed to save position changes to IndexedDB:", error);
    }
  },
  300
);

const debouncedSaveFull = debounce(
  async (diagrams: Diagram[], selectedDiagramId: number | null) => {
    try {
      await db.transaction("rw", db.diagrams, db.appState, async () => {
        const allDbDiagramIds = (await db.diagrams
          .toCollection()
          .primaryKeys()) as number[];
        const storeDiagramIds = diagrams
          .map((d) => d.id)
          .filter(Boolean) as number[];

        // Safety guard: do not bulk delete when store has no diagrams
        // This prevents accidental full data wipe if a save triggers before load
        if (storeDiagramIds.length > 0) {
          const idsToDelete = allDbDiagramIds.filter(
            (id) => !storeDiagramIds.includes(id)
          );
          if (idsToDelete.length > 0) {
            await db.diagrams.bulkDelete(idsToDelete);
          }
        }

        if (diagrams.length > 0) {
          await db.diagrams.bulkPut(diagrams);
        }

        if (selectedDiagramId !== null) {
          await db.appState.put({
            key: "selectedDiagramId",
            value: selectedDiagramId,
          });
        } else {
          await db.appState.delete("selectedDiagramId").catch(() => {});
        }
      });

      previousDiagrams = diagrams;
      previousSelectedDiagramId = selectedDiagramId;
    } catch (error) {
      console.error("Failed to save state to IndexedDB:", error);
    }
  },
  1000
);

// Helper function to check if only positions changed
function checkIfOnlyPositionsChanged(
  currentNodes: (AppNode | AppNoteNode | AppZoneNode)[],
  previousNodes: (AppNode | AppNoteNode | AppZoneNode)[]
): boolean {
  if (currentNodes.length !== previousNodes.length) {
    return false;
  }
  const previousNodeMap = new Map(previousNodes.map((node) => [node.id, node]));

  for (const currentNode of currentNodes) {
    const previousNode = previousNodeMap.get(currentNode.id);

    if (!previousNode) {
      return false;
    }

    if (currentNode.type !== previousNode.type) {
      return false;
    }

    const { position: _, ...currentWithoutPosition } = currentNode;
    const { position: __, ...previousWithoutPosition } = previousNode;

    if (
      JSON.stringify(currentWithoutPosition) !==
      JSON.stringify(previousWithoutPosition)
    ) {
      return false;
    }

    if (
      currentNode.position.x !== previousNode.position.x ||
      currentNode.position.y !== previousNode.position.y
    ) {
      // Position changed, continue checking
      continue;
    }
  }

  return true;
}

// Helper function to save only position changes using Dexie's modify
async function savePositionChanges(
  currentDiagram: Diagram,
  previousDiagram: Diagram
) {
  try {
    const changedNodes: {
      id: string;
      position: { x: number; y: number };
      type: string;
    }[] = [];

    const currentTableMap = new Map(
      (currentDiagram.data.nodes || []).map((n) => [n.id, n])
    );
    for (const prevNode of previousDiagram.data.nodes || []) {
      const currentNode = currentTableMap.get(prevNode.id);
      if (
        currentNode &&
        (currentNode.position.x !== prevNode.position.x ||
          currentNode.position.y !== prevNode.position.y)
      ) {
        changedNodes.push({
          id: currentNode.id,
          position: currentNode.position,
          type: "table",
        });
      }
    }

    const currentNoteMap = new Map(
      (currentDiagram.data.notes || []).map((n) => [n.id, n])
    );
    for (const prevNote of previousDiagram.data.notes || []) {
      const currentNote = currentNoteMap.get(prevNote.id);
      if (
        currentNote &&
        (currentNote.position.x !== prevNote.position.x ||
          currentNote.position.y !== prevNote.position.y)
      ) {
        changedNodes.push({
          id: currentNote.id,
          position: currentNote.position,
          type: "note",
        });
      }
    }

    const currentZoneMap = new Map(
      (currentDiagram.data.zones || []).map((z) => [z.id, z])
    );
    for (const prevZone of previousDiagram.data.zones || []) {
      const currentZone = currentZoneMap.get(prevZone.id);
      if (
        currentZone &&
        (currentZone.position.x !== prevZone.position.x ||
          currentZone.position.y !== prevZone.position.y)
      ) {
        changedNodes.push({
          id: currentZone.id,
          position: currentZone.position,
          type: "zone",
        });
      }
    }

    if (changedNodes.length === 0) {
      return;
    }

    await saveSpecificNodePositions(currentDiagram.id!, changedNodes);
  } catch (error) {
    console.error("Failed to save position changes:", error);
    throw error;
  }
}

// Main debounced save function that determines which strategy to use
const debouncedSave = async (
  diagrams: Diagram[],
  selectedDiagramId: number | null
) => {
  await debouncedSavePositions(diagrams, selectedDiagramId);
};

async function saveSpecificNodePositions(
  diagramId: number,
  updatedNodes: {
    id: string;
    position: { x: number; y: number };
    type: string;
  }[]
) {
  try {
    await db.transaction("rw", db.diagrams, async () => {
      // Update only the specific nodes that have changed
      await db.diagrams
        .where("id")
        .equals(diagramId)
        .modify((diagram) => {
          const updatedNodeMap = new Map(
            updatedNodes.map((node) => [node.id, node.position])
          );
          const updatedNodeTypes = new Map(
            updatedNodes.map((node) => [node.id, node.type])
          );

          if (diagram.data.nodes) {
            diagram.data.nodes = diagram.data.nodes.map((node) => {
              const newPosition = updatedNodeMap.get(node.id);
              if (newPosition && updatedNodeTypes.get(node.id) === "table") {
                return { ...node, position: newPosition };
              }
              return node;
            });
          }

          if (diagram.data.notes) {
            diagram.data.notes = diagram.data.notes.map((note) => {
              const newPosition = updatedNodeMap.get(note.id);
              if (newPosition && updatedNodeTypes.get(note.id) === "note") {
                return { ...note, position: newPosition };
              }
              return note;
            });
          }

          if (diagram.data.zones) {
            diagram.data.zones = diagram.data.zones.map((zone) => {
              const newPosition = updatedNodeMap.get(zone.id);
              if (newPosition && updatedNodeTypes.get(zone.id) === "zone") {
                return { ...zone, position: newPosition };
              }
              return zone;
            });
          }

          diagram.updatedAt = new Date();
        });
    });
  } catch (error) {
    console.error("Failed to save specific node positions:", error);
    throw error;
  }
}

export const useStore = create(
  subscribeWithSelector<StoreState>((set) => ({
    diagrams: [],
    diagramsMap: new Map(),
    selectedDiagramId: null,
    selectedNodeId: null,
    selectedEdgeId: null,
    settings: DEFAULT_SETTINGS,
    isLoading: true,
    clipboard: null,
    lastCursorPosition: null,
    isRelationshipDialogOpen: false,
    onlyRenderVisibleElements: true, // Default to true for performance
    loadInitialData: async () => {
      set({ isLoading: true });
      set({ isRelationshipDialogOpen: false });
      const diagrams = await db.diagrams.toArray();
      const selectedDiagramIdState = await db.appState.get("selectedDiagramId");

      // Load settings and merge with defaults to ensure new options have defaults
      const settingsState = await db.appState.get("settings");
      let settings = DEFAULT_SETTINGS;
      if (settingsState && typeof settingsState.value === "string") {
        try {
          const parsed = JSON.parse(settingsState.value);
          settings = { ...DEFAULT_SETTINGS, ...parsed } as Settings;
        } catch (e) {
          console.error("Failed to parse settings:", e);
        }
      }

      let selectedDiagramId = null;
      if (
        selectedDiagramIdState &&
        typeof selectedDiagramIdState.value === "number"
      ) {
        const diagramExists = diagrams.some(
          (d) => d.id === selectedDiagramIdState.value && !d.deletedAt
        );
        if (diagramExists) {
          selectedDiagramId = selectedDiagramIdState.value;
        }
      }
      set({
        diagrams,
        diagramsMap: createDiagramsMap(diagrams),
        selectedDiagramId,
        settings,
        isLoading: false,
      });
    },
    setSelectedDiagramId: (id) =>
      set({
        selectedDiagramId: id,
        selectedNodeId: null,
        selectedEdgeId: null,
      }),
    setSelectedNodeId: (id) => set({ selectedNodeId: id }),
    setSelectedEdgeId: (id) => set({ selectedEdgeId: id }),
    setLastCursorPosition: (position) => set({ lastCursorPosition: position }),
    updateSettings: (newSettings) => {
      set((state) => {
        const updatedSettings = { ...state.settings, ...newSettings };
        db.appState
          .put({
            key: "settings",
            value: JSON.stringify(updatedSettings),
          })
          .catch((error) => {
            console.error("Failed to save settings:", error);
          });
        return { settings: updatedSettings };
      });
    },
    createDiagram: async (diagramData) => {
      const newDiagram: Diagram = {
        ...diagramData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const id = await db.diagrams.add(newDiagram);
      set((state) => {
        const updatedDiagrams = [...state.diagrams, { ...newDiagram, id }];
        return {
          diagrams: updatedDiagrams,
          diagramsMap: createDiagramsMap(updatedDiagrams),
          selectedDiagramId: id,
        };
      });
    },
    importDiagram: async (diagramData) => {
      const newDiagram: Diagram = {
        ...diagramData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const id = await db.diagrams.add(newDiagram);
      set((state) => {
        const updatedDiagrams = [...state.diagrams, { ...newDiagram, id }];
        return {
          diagrams: updatedDiagrams,
          diagramsMap: createDiagramsMap(updatedDiagrams),
          selectedDiagramId: id,
        };
      });
    },
    renameDiagram: (id, name) => {
      set((state) => ({
        diagrams: state.diagrams.map((d) =>
          d.id === id ? { ...d, name, updatedAt: new Date() } : d
        ),
      }));
    },
    duplicateDiagram: async (id) => {
      // Use set to get the current state and perform the duplication
      set((state) => {
        const currentDiagram = getDiagramById(state.diagramsMap, id);
        if (!currentDiagram) {
          return state;
        }

        // Generate a unique name for the duplicate
        const existingNames = new Set(state.diagrams.map(d => d.name));
        let duplicateName = `${currentDiagram.name} (Copy)`;
        let counter = 1;
        while (existingNames.has(duplicateName)) {
          duplicateName = `${currentDiagram.name} (Copy ${counter})`;
          counter++;
        }

        // Create new IDs for nodes, edges, notes, and zones
        const nodeIdMap = new Map();
        const newNodes = currentDiagram.data.nodes?.map(node => {
          const newId = `${node.type}-${+new Date()}-${Math.random().toString(36).substr(2, 9)}`;
          nodeIdMap.set(node.id, newId);
          return {
            ...node,
            id: newId,
            selected: false,
          };
        }) || [];

        const newEdges = currentDiagram.data.edges?.map(edge => ({
          ...edge,
          id: `edge-${+new Date()}-${Math.random().toString(36).substr(2, 9)}`,
          source: nodeIdMap.get(edge.source) || edge.source,
          target: nodeIdMap.get(edge.target) || edge.target,
        })) || [];

        const newNotes = currentDiagram.data.notes?.map(note => ({
          ...note,
          id: `${note.type}-${+new Date()}-${Math.random().toString(36).substr(2, 9)}`,
          selected: false,
        })) || [];

        const newZones = currentDiagram.data.zones?.map(zone => ({
          ...zone,
          id: `${zone.type}-${+new Date()}-${Math.random().toString(36).substr(2, 9)}`,
          selected: false,
        })) || [];

        const duplicatedDiagram: Omit<Diagram, "id" | "createdAt" | "updatedAt"> = {
          name: duplicateName,
          dbType: currentDiagram.dbType,
          data: {
            ...currentDiagram.data,
            nodes: newNodes,
            edges: newEdges,
            notes: newNotes,
            zones: newZones,
          },
        };

        const newDiagram: Diagram = {
          ...duplicatedDiagram,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        
        // Add to database and update state
        db.diagrams.add(newDiagram).then((newId) => {
          set((state) => {
            const updatedDiagrams = [...state.diagrams, { ...newDiagram, id: newId }];
            return {
              diagrams: updatedDiagrams,
              diagramsMap: createDiagramsMap(updatedDiagrams),
              selectedDiagramId: newId,
            };
          });
        }).catch((error) => {
          console.error('Failed to duplicate diagram:', error);
        });
        
        return state;
      });
    },
    moveDiagramToTrash: (id) => {
      set((state) => ({
        diagrams: state.diagrams.map((d) =>
          d.id === id
            ? { ...d, deletedAt: new Date(), updatedAt: new Date() }
            : d
        ),
      }));
    },
    restoreDiagram: (id) => {
      set((state) => ({
        diagrams: state.diagrams.map((d) =>
          d.id === id ? { ...d, deletedAt: null, updatedAt: new Date() } : d
        ),
      }));
    },
    permanentlyDeleteDiagram: (id) => {
      set((state) => ({
        diagrams: state.diagrams.filter((d) => d.id !== id),
      }));
    },
    updateCurrentDiagramData: (data) => {
      set((state) => {
        const updatedDiagrams = state.diagrams.map((d) =>
          d.id === state.selectedDiagramId
            ? { ...d, data: { ...d.data, ...data }, updatedAt: new Date() }
            : d
        );
        return {
          diagrams: updatedDiagrams,
          diagramsMap: createDiagramsMap(updatedDiagrams),
        };
      });
    },
    onNodesChange: (changes) => {
      set((state) => {
        const diagram = getDiagramById(state.diagramsMap, state.selectedDiagramId);
        if (!diagram) return state;

        const allDiagramNodes = [
          ...(diagram.data.nodes || []),
          ...(diagram.data.notes || []),
          ...(diagram.data.zones || []),
        ];
        const updatedNodes = applyNodeChanges(changes, allDiagramNodes);

        const newNodes = updatedNodes.filter(
          (n) => n.type === "table"
        ) as AppNode[];
        const newNotes = updatedNodes.filter(
          (n) => n.type === "note"
        ) as AppNoteNode[];
        const newZones = updatedNodes.filter(
          (n) => n.type === "zone"
        ) as AppZoneNode[];

        const updatedDiagrams = state.diagrams.map((d) =>
          d.id === state.selectedDiagramId
            ? {
                ...d,
                data: {
                  ...d.data,
                  nodes: newNodes,
                  notes: newNotes,
                  zones: newZones,
                },
                updatedAt: new Date(),
              }
            : d
        );

        return {
          diagrams: updatedDiagrams,
          diagramsMap: createDiagramsMap(updatedDiagrams),
        };
      });
    },
    onEdgesChange: (changes) => {
      set((state) => {
        const diagram = getDiagramById(state.diagramsMap, state.selectedDiagramId);
        if (!diagram) return state;
        const updatedEdges = applyEdgeChanges(
          changes,
          diagram.data.edges || []
        ) as AppEdge[];
        
        const updatedDiagrams = state.diagrams.map((d) =>
          d.id === state.selectedDiagramId
            ? {
                ...d,
                data: { ...d.data, edges: updatedEdges },
                updatedAt: new Date(),
              }
            : d
        );
        
        return {
          diagrams: updatedDiagrams,
          diagramsMap: createDiagramsMap(updatedDiagrams),
        };
      });
    },
    addEdge: (edge) => {
      set((state) => {
        const diagram = getDiagramById(state.diagramsMap, state.selectedDiagramId);
        if (!diagram) return state;
        const newEdges = [...(diagram.data.edges || []), edge];
        
        const updatedDiagrams = state.diagrams.map((d) =>
          d.id === state.selectedDiagramId
            ? {
                ...d,
                data: { ...d.data, edges: newEdges },
                updatedAt: new Date(),
              }
            : d
        );
        
        return {
          diagrams: updatedDiagrams,
          diagramsMap: createDiagramsMap(updatedDiagrams),
        };
      });
    },
    updateNode: (nodeToUpdate) => {
      set((state) => {
        const diagram = getDiagramById(state.diagramsMap, state.selectedDiagramId);
        if (!diagram) return state;

        const updatedData = { ...diagram.data };

        if (nodeToUpdate.type === "table") {
          updatedData.nodes = (diagram.data.nodes || []).map((node) =>
            node.id === nodeToUpdate.id ? (nodeToUpdate as AppNode) : node
          );
        } else if (nodeToUpdate.type === "note") {
          updatedData.notes = (diagram.data.notes || []).map((note) =>
            note.id === nodeToUpdate.id ? (nodeToUpdate as AppNoteNode) : note
          );
        } else if (nodeToUpdate.type === "zone") {
          updatedData.zones = (diagram.data.zones || []).map((zone) =>
            zone.id === nodeToUpdate.id ? (nodeToUpdate as AppZoneNode) : zone
          );
        }

        return updateDiagramsWithMap(state.diagrams, (diagrams) =>
          diagrams.map((d) =>
            d.id === state.selectedDiagramId
              ? {
                  ...d,
                  data: updatedData,
                  updatedAt: new Date(),
                }
              : d
          )
        );
      });
    },
    deleteNodes: (nodeIds) => {
      set((state) => {
        const diagram = getDiagramById(state.diagramsMap, state.selectedDiagramId);
        if (!diagram) return state;

        // Helper function to mark table nodes as deleted
        const markAsDeleted = (list: AppNode[] | undefined): AppNode[] =>
          (list || []).map((item) =>
            nodeIds.includes(item.id) && item.type === "table"
              ? {
                  ...item,
                  data: {
                    ...item.data,
                    isDeleted: true,
                    deletedAt: new Date(),
                  },
                }
              : item
          );

        const nodesWithNewDeletes = markAsDeleted(diagram.data.nodes);
        const allDeletedTables = nodesWithNewDeletes.filter(
          (node) => node.type === "table" && node.data?.isDeleted === true
        );

        let finalNodes = nodesWithNewDeletes;

        if (allDeletedTables.length > TABLE_SOFT_DELETE_LIMIT) {
          // Sort deleted tables by deletion time (oldest first)
          const sortedDeletedTables = [...allDeletedTables].sort((a, b) => {
            const aTime = a.data?.deletedAt
              ? new Date(a.data.deletedAt).getTime()
              : 0;
            const bTime = b.data?.deletedAt
              ? new Date(b.data.deletedAt).getTime()
              : 0;
            return aTime - bTime;
          });

          const tablesToRemoveCount =
            allDeletedTables.length - TABLE_SOFT_DELETE_LIMIT;
          const tablesToRemove = sortedDeletedTables.slice(
            0,
            tablesToRemoveCount
          );
          const tableIdsToRemove = new Set(
            tablesToRemove.map((table) => table.id)
          );

          // Permanently remove the oldest deleted tables
          finalNodes = nodesWithNewDeletes.filter(
            (node) => !tableIdsToRemove.has(node.id)
          );
        }

        const filterNotesForDeletion = (notes: AppNoteNode[]): AppNoteNode[] =>
          (notes || []).filter((note) => !nodeIds.includes(note.id));

        const filterZonesForDeletion = (zones: AppZoneNode[]): AppZoneNode[] =>
          (zones || []).filter((zone) => !nodeIds.includes(zone.id));

        return updateDiagramsWithMap(state.diagrams, (diagrams) =>
          diagrams.map((d) =>
            d.id === state.selectedDiagramId
              ? {
                  ...d,
                  data: {
                    ...d.data,
                    nodes: finalNodes,
                    notes: filterNotesForDeletion(d.data.notes || []),
                    zones: filterZonesForDeletion(d.data.zones || []),
                  },
                  updatedAt: new Date(),
                }
              : d
          )
        );
      });
    },
    updateEdge: (edgeToUpdate) => {
      set((state) => {
        const diagram = getDiagramById(state.diagramsMap, state.selectedDiagramId);
        if (!diagram) return state;
        const newEdges = (diagram.data.edges || []).map((edge) =>
          edge.id === edgeToUpdate.id ? edgeToUpdate : edge
        );
        return updateDiagramsWithMap(state.diagrams, (diagrams) =>
          diagrams.map((d) =>
            d.id === state.selectedDiagramId
              ? {
                  ...d,
                  data: { ...d.data, edges: newEdges },
                  updatedAt: new Date(),
                }
              : d
          )
        );
      });
    },
    deleteEdge: (edgeId) => {
      set((state) => {
        const diagram = getDiagramById(state.diagramsMap, state.selectedDiagramId);
        if (!diagram) return state;
        const newEdges = (diagram.data.edges || []).filter(
          (edge) => edge.id !== edgeId
        );
        return updateDiagramsWithMap(state.diagrams, (diagrams) =>
          diagrams.map((d) =>
            d.id === state.selectedDiagramId
              ? {
                  ...d,
                  data: { ...d.data, edges: newEdges },
                  updatedAt: new Date(),
                }
              : d
          )
        );
      });
    },
    addNode: (node) => {
      set((state) => {
        const diagram = getDiagramById(state.diagramsMap, state.selectedDiagramId);
        if (!diagram) return state;

        const updatedData = { ...diagram.data };
        if (node.type === "table") {
          updatedData.nodes = [...(diagram.data.nodes || []), node];
        } else if (node.type === "note") {
          updatedData.notes = [...(diagram.data.notes || []), node];
        } else if (node.type === "zone") {
          updatedData.zones = [...(diagram.data.zones || []), node];
        }

        return updateDiagramsWithMap(state.diagrams, (diagrams) =>
          diagrams.map((d) =>
            d.id === state.selectedDiagramId
              ? { ...d, data: updatedData, updatedAt: new Date() }
              : d
          )
        );
      });
    },
    undoDelete: () => {
      set((state) => {
        const diagram = getDiagramById(state.diagramsMap, state.selectedDiagramId);
        if (!diagram) return state;

        const deletedNodes = (diagram.data.nodes || []).filter(
          (n) => n.data?.isDeleted === true && n.data?.deletedAt
        );

        if (deletedNodes.length === 0) return state;

        const lastDeletedNode = deletedNodes.reduce((latest, current) => {
          const latestTime = new Date(latest?.data?.deletedAt || "").getTime();
          const currentTime = new Date(
            current?.data?.deletedAt || ""
          ).getTime();
          return latestTime > currentTime ? latest : current;
        });

        const newNodes = (diagram.data.nodes || []).map((n) => {
          if (n.id === lastDeletedNode.id) {
            return {
              ...n,
              data: {
                ...n.data,
                isDeleted: false,
                deletedAt: undefined as unknown as Date, // Clear the deletion timestamp
              },
            };
          }
          return n;
        });

        return updateDiagramsWithMap(state.diagrams, (diagrams) =>
          diagrams.map((d) =>
            d.id === state.selectedDiagramId
              ? {
                  ...d,
                  data: {
                    ...d.data,
                    nodes: newNodes,
                  },
                  updatedAt: new Date(),
                }
              : d
          )
        );
      });
    },

    batchUpdateNodes: (nodesToUpdate) => {
      set((state) => {
        const diagram = getDiagramById(state.diagramsMap, state.selectedDiagramId);
        if (!diagram) return state;
        
        const nodeMap = new Map(nodesToUpdate.map((n) => [n.id, n]));
        
        const newNodes = (diagram.data.nodes || []).map(
          (n) => {
            const updated = nodeMap.get(n.id);
            return (updated && updated.type === 'table' ? updated as AppNode : n);
          }
        );
        const newNotes = (diagram.data.notes || []).map(
          (n) => {
            const updated = nodeMap.get(n.id);
            return (updated && updated.type === 'note' ? updated as AppNoteNode : n);
          }
        );
        const newZones = (diagram.data.zones || []).map(
          (n) => {
            const updated = nodeMap.get(n.id);
            return (updated && updated.type === 'zone' ? updated as AppZoneNode : n);
          }
        );

        return updateDiagramsWithMap(state.diagrams, (diagrams) =>
          diagrams.map((d) =>
            d.id === state.selectedDiagramId
              ? {
                  ...d,
                  data: { 
                    ...d.data, 
                    nodes: newNodes,
                    notes: newNotes,
                    zones: newZones
                  },
                  updatedAt: new Date(),
                }
              : d
          )
        );
      });
    },
    copyNodes: (nodes) => {
      set({ clipboard: nodes });
    },
    pasteNodes: (position) => {
      set((state) => {
        const { clipboard, diagrams, selectedDiagramId } = state;
        if (!clipboard || clipboard.length === 0 || !selectedDiagramId) {
          return state;
        }

        const diagram = diagrams.find((d) => d.id === selectedDiagramId);
        if (!diagram) return state;

        const existingLabels = new Set(
          diagram.data.nodes.map((n) => n.data.label)
        );

        const newNodes: AppNode[] = [];
        const newNotes: AppNoteNode[] = [];

        clipboard.forEach((node, index) => {
          const newNodeId = `${node.type}-${+new Date()}-${index}`;
          const newPosition = {
            x: position.x + index * 20,
            y: position.y + index * 20,
          };

          if (node.type === "table") {
            let newLabel = `${node.data.label}_copy`;
            let i = 1;
            while (existingLabels.has(newLabel)) {
              newLabel = `${node.data.label}_copy_${i++}`;
            }
            existingLabels.add(newLabel);

            const newTableNode: AppNode = {
              ...node,
              id: newNodeId,
              position: newPosition,
              data: {
                ...node.data,
                label: newLabel,
              },
              selected: false,
            };
            newNodes.push(newTableNode);
          } else if (node.type === "note") {
            const newNoteNode: AppNoteNode = {
              ...node,
              id: newNodeId,
              position: newPosition,
              selected: false,
            };
            newNotes.push(newNoteNode);
          }
        });

        const updatedDiagram = {
          ...diagram,
          data: {
            ...diagram.data,
            nodes: [...(diagram.data.nodes || []), ...newNodes],
            notes: [...(diagram.data.notes || []), ...newNotes],
          },
          updatedAt: new Date(),
        };

        set({ clipboard: null });

        return {
          diagrams: diagrams.map((d) =>
            d.id === selectedDiagramId ? updatedDiagram : d
          ),
          // Clear the cursor position after paste
          lastCursorPosition: null,
        };
      });
    },
    setIsRelationshipDialogOpen: (value) => {
      set({ isRelationshipDialogOpen: value });
    },
    setOnlyRenderVisibleElements: (value) => {
      set({ onlyRenderVisibleElements: value });
    },
    reorganizeTables: () => {
      set((state) => {
        const diagram = getDiagramById(state.diagramsMap, state.selectedDiagramId);
        if (!diagram) return state;

        const tables = diagram.data.nodes || [];
        const relationships = diagram.data.edges || [];
        const zones = diagram.data.zones || [];

        // Use the zone-aware layout algorithm
        const organizedTables = organizeTablesByRelationshipsWithZones(
          tables,
          relationships,
          zones
        );

        return updateDiagramsWithMap(state.diagrams, (diagrams) =>
          diagrams.map((d) =>
            d.id === state.selectedDiagramId
              ? {
                  ...d,
                  data: { ...d.data, nodes: organizedTables },
                  updatedAt: new Date(),
                }
              : d
          )
        );
      });
    },
    toggleLock: () => {
      set((state) => {
        const diagram = getDiagramById(state.diagramsMap, state.selectedDiagramId);
        if (!diagram) return state;

        const currentLockState = diagram.data.isLocked ?? false;
        const newLockState = !currentLockState;

        return updateDiagramsWithMap(state.diagrams, (diagrams) =>
          diagrams.map((d) =>
            d.id === state.selectedDiagramId
              ? {
                  ...d,
                  data: { ...d.data, isLocked: newLockState },
                  updatedAt: new Date(),
                }
              : d
          )
        );
      });
    },
  }))
);

useStore.subscribe(
  (state) => ({
    diagrams: state.diagrams,
    selectedDiagramId: state.selectedDiagramId,
    isLoading: state.isLoading,
  }),
  (state) => {
    if (!state.isLoading) {
      debouncedSave(state.diagrams, state.selectedDiagramId);
    }
  },
  { equalityFn: shallow }
);
