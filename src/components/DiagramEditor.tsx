import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { tableColors } from "@/lib/colors";
import { colors, DbRelationship, relationshipTypes } from "@/lib/constants";
import { type AppEdge, type AppNode, type AppNoteNode, type AppZoneNode, type ProcessedEdge, type ProcessedNode } from "@/lib/types";
import { findNonOverlappingPosition, isNodeInLockedZone } from "@/lib/utils";
import { useStore, type StoreState } from "@/store/store";
import { showError } from "@/utils/toast";
import {
  Background,
  ControlButton,
  Controls,
  ReactFlow,
  type ColorMode,
  type Connection,
  type Edge,
  type NodeProps,
  type NodeTypes,
  type OnConnect,
  type OnSelectionChangeParams,
  type ReactFlowInstance,
  type Viewport
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Clipboard, Grid2x2Check, Magnet, Plus, SquareDashed, StickyNote } from "lucide-react";
import { useTheme } from "next-themes";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from "react";
import { IoLockClosedOutline, IoLockOpenOutline } from "react-icons/io5";
import { useDebouncedCallback } from "use-debounce";
import { useShallow } from "zustand/react/shallow";
import CustomEdge from "./CustomEdge";
import NoteNode from "./NoteNode";
import TableNode from "./TableNode";
import ZoneNode from "./ZoneNode";

// Define nodeTypes outside component to prevent recreation
const nodeTypes: NodeTypes = {
  table: (props: NodeProps<AppNode>) => {
    return (
      <TableNode
        {...props}
        onDelete={props.data.onDelete || (() => { })}
      />
    );
  },
  note: (props: NodeProps<AppNoteNode>) => {
    return (
      <NoteNode
        {...props}
        onUpdate={props.data.onUpdate || (() => { })}
        onDelete={props.data.onDelete || (() => { })}
      />
    );
  },
  zone: (props: NodeProps<AppZoneNode>) => {
    return (
      <ZoneNode
        {...props}
        onUpdate={props.data.onUpdate || (() => { })}
        onDelete={props.data.onDelete || (() => { })}
        onCreateTableAtPosition={props.data.onCreateTableAtPosition || (() => { })}
        onCreateNoteAtPosition={props.data.onCreateNoteAtPosition || (() => { })}
      />
    );
  },
};

interface DiagramEditorProps {
  setRfInstance: (instance: ReactFlowInstance<ProcessedNode, ProcessedEdge> | null) => void;
}

const DiagramEditor = forwardRef(
  ({ setRfInstance }: DiagramEditorProps, ref) => {
    const selectedDiagramId = useStore((state) => state.selectedDiagramId);
    const allDiagrams = useStore((state) => state.diagrams);

    const diagram = useMemo(() =>
      allDiagrams.find(d => d.id === selectedDiagramId),
      [allDiagrams, selectedDiagramId]
    );

    // Ref to store the React Flow instance
    const rfInstanceRef = useRef<ReactFlowInstance<ProcessedNode, ProcessedEdge> | null>(null);

    const {
      onNodesChange,
      onEdgesChange,
      addEdge: addEdgeToStore,
      updateCurrentDiagramData,
      deleteNodes,
      updateNode,
      addNode,
      undoDelete,
      batchUpdateNodes,
      selectedNodeId,
      setSelectedNodeId,
      selectedEdgeId,
      setSelectedEdgeId,
      setLastCursorPosition,
      pasteNodes,
      clipboard,
      settings,
      updateSettings,
    } = useStore(
      useShallow((state: StoreState) => ({
        onNodesChange: state.onNodesChange,
        onEdgesChange: state.onEdgesChange,
        addEdge: state.addEdge,
        updateCurrentDiagramData: state.updateCurrentDiagramData,
        deleteNodes: state.deleteNodes,
        updateNode: state.updateNode,
        addNode: state.addNode,
        undoDelete: state.undoDelete,
        batchUpdateNodes: state.batchUpdateNodes,
        selectedNodeId: state.selectedNodeId,
        setSelectedNodeId: state.setSelectedNodeId,
        selectedEdgeId: state.selectedEdgeId,
        setSelectedEdgeId: state.setSelectedEdgeId,
        setLastCursorPosition: state.setLastCursorPosition,
        pasteNodes: state.pasteNodes,
        clipboard: state.clipboard,
        settings: state.settings,
        updateSettings: state.updateSettings,
      }))
    );
    const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const { theme } = useTheme();
    const clickPositionRef = useRef<{ x: number; y: number } | null>(null);

    const nodes = useMemo(() => diagram?.data.nodes || [], [diagram?.data.nodes]);
    const edges = useMemo(() => diagram?.data.edges || [], [diagram?.data.edges]);
    const notes = useMemo(() => diagram?.data.notes || [], [diagram?.data.notes]);
    const zones = useMemo(() => diagram?.data.zones || [], [diagram?.data.zones]);
    const isLocked = useMemo(() => diagram?.data.isLocked ?? false, [diagram?.data.isLocked]);

    const edgeTypes = useMemo(() => ({ custom: CustomEdge }), []);
    const visibleNodes = useMemo(() => nodes.filter((n) => !n.data.isDeleted), [nodes]);

    const onSelectionChange = useCallback(({ nodes, edges }: OnSelectionChangeParams) => {
      if (nodes.length === 1 && edges.length === 0 && nodes[0]) {
        if (nodes[0].type === 'table') {
          setSelectedNodeId(nodes[0].id);
          setSelectedEdgeId(null);
        } else {
          setSelectedNodeId(null);
        }
      } else if (edges.length === 1 && nodes.length === 0 && edges[0]) {
        setSelectedEdgeId(edges[0].id);
        setSelectedNodeId(null);
      } else {
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
      }
    }, [setSelectedNodeId, setSelectedEdgeId]);

    const handleViewportChange = useDebouncedCallback((viewport: Viewport) => {
      if (diagram) {
        updateCurrentDiagramData({ viewport });
      }
    }, 500);

    const onEdgeMouseEnter = useCallback((_: React.MouseEvent, edge: Edge) => setHoveredEdgeId(edge.id), []);
    const onEdgeMouseLeave = useCallback(() => setHoveredEdgeId(null), []);

    const processedEdges = useMemo((): ProcessedEdge[] => {
      return edges.map((edge) => ({
        ...edge,
        type: "custom",
        selectable: !isLocked,
        data: {
          ...edge.data,
          relationship: edge.data?.relationship || relationshipTypes[1]?.value || DbRelationship.ONE_TO_MANY,
          isHighlighted: edge.source === selectedNodeId || edge.target === selectedNodeId || edge.id === selectedEdgeId || edge.id === hoveredEdgeId,
        },
      }));
    }, [edges, selectedNodeId, selectedEdgeId, hoveredEdgeId, isLocked]);

    const handleLockChange = useCallback(() => {
      updateCurrentDiagramData({ isLocked: !isLocked });
    }, [isLocked, updateCurrentDiagramData]);

    const handleSnapToGridChange = useCallback(() => {
      const snapToGrid = settings.snapToGrid;
      updateSettings({ snapToGrid: !snapToGrid });
    }, [settings.snapToGrid, updateSettings]);

    const onConnect: OnConnect = useCallback((connection: Connection) => {
      const { source, target, sourceHandle, targetHandle } = connection;
      if (!source || !target || !sourceHandle || !targetHandle) return;

      const getColumnId = (handleId: string) => handleId.split('-')[0];
      const sourceNode = nodes.find(n => n.id === source);
      const targetNode = nodes.find(n => n.id === target);
      if (!sourceNode || !targetNode) return;

      const sourceColumn = sourceNode.data.columns.find(c => c.id === getColumnId(sourceHandle));
      const targetColumn = targetNode.data.columns.find(c => c.id === getColumnId(targetHandle));
      if (!sourceColumn || !targetColumn) return;

      if (sourceColumn.type !== targetColumn.type) {
        showError("Cannot create relationship: Column types do not match.");
        return;
      }

      const newEdge: AppEdge = {
        ...connection,
        id: `${source}-${target}-${sourceHandle}-${targetHandle}`,
        type: "custom",
        data: { relationship: relationshipTypes[1]?.value || DbRelationship.ONE_TO_MANY },
      };
      addEdgeToStore(newEdge);
    }, [nodes, addEdgeToStore]);

    const onInit = useCallback((instance: ReactFlowInstance<ProcessedNode, ProcessedEdge>) => {
      rfInstanceRef.current = instance;
      setRfInstance(instance);

      // Restore viewport if rememberLastPosition is enabled and viewport is available
      if (settings.rememberLastPosition && diagram?.data.viewport) {
        const { x, y, zoom } = diagram.data.viewport;
        instance.setViewport({ x, y, zoom });
      } else {
        instance.fitView({ duration: 200 });
      }
    }, [setRfInstance, diagram?.data.viewport, settings.rememberLastPosition]);

    const onCreateTableAtPosition = useCallback((position: { x: number; y: number }) => {
      if (!diagram) return;
      const visibleNodes = diagram.data.nodes.filter((n: AppNode) => !n.data.isDeleted) || [];
      const tableName = `new_table_${visibleNodes.length + 1}`;
      const defaultPosition = { x: position.x - 144, y: position.y - 50 };
      const nonOverlappingPosition = findNonOverlappingPosition(visibleNodes, defaultPosition);
      
      const newNode: AppNode = {
        id: `${tableName}-${+new Date()}`,
        type: "table",
        position: nonOverlappingPosition,
        data: {
          label: tableName,
          color: tableColors[Math.floor(Math.random() * tableColors.length)] ?? colors.DEFAULT_TABLE_COLOR,
          columns: [{ id: `col_${Date.now()}`, name: "id", type: "INT", pk: true, nullable: false }],
          order: visibleNodes.length,
        },
      };
      addNode(newNode);
    }, [diagram, addNode]);

    const onCreateNoteAtPosition = useCallback((position: { x: number; y: number }) => {
      const newNote: AppNoteNode = {
        id: `note-${+new Date()}`, type: 'note', position, width: 192, height: 192, data: { text: 'New Note' },
      };
      addNode(newNote);
    }, [addNode]);

    const onCreateZoneAtPosition = useCallback((position: { x: number; y: number }) => {
      const newZone: AppZoneNode = {
        id: `zone-${+new Date()}`, type: 'zone', position, width: 300, height: 300, zIndex: -1, data: { name: 'New Zone' },
      };
      addNode(newZone);
    }, [addNode]);

    const onPaneContextMenu = useCallback((event: React.MouseEvent | MouseEvent) => {
      const pane = reactFlowWrapper.current?.getBoundingClientRect();
      if (!pane) return;
      clickPositionRef.current = { x: event.clientX, y: event.clientY };
      setLastCursorPosition({ x: event.clientX, y: event.clientY });
    }, [setLastCursorPosition]);

    const onPaneMouseMove = useCallback((event: React.MouseEvent | MouseEvent) => {
      setLastCursorPosition({ x: event.clientX, y: event.clientY });
    }, [setLastCursorPosition]);

    useImperativeHandle(ref, () => ({
      undoDelete,
      batchUpdateNodes,
    }));

    const handleZoneUpdate = useCallback((id: string, data: Partial<import('@/lib/types').ZoneNodeData>) => {
      const zone = zones.find(z => z.id === id);
      if (zone) {
        updateNode({ ...zone, data: { ...zone.data, ...data } });
      }
    }, [zones, updateNode]);

    const handleZoneDelete = useCallback((ids: string[]) => {
      deleteNodes(ids);
    }, [deleteNodes]);

    const handleNoteUpdate = useCallback((id: string, data: Partial<import('@/lib/types').NoteNodeData>) => {
      const note = notes.find(n => n.id === id);
      if (note) {
        updateNode({ ...note, data: { ...note.data, ...data } });
      }
    }, [notes, updateNode]);

    const handleNoteDelete = useCallback((ids: string[]) => {
      deleteNodes(ids);
    }, [deleteNodes]);

    const handleTableDelete = useCallback((ids: string[]) => {
      deleteNodes(ids);
    }, [deleteNodes]);

    const notesWithCallbacks = useMemo(() => notes.map(note => ({
      ...note,
      data: {
        ...note.data,
        onUpdate: handleNoteUpdate,
        onDelete: handleNoteDelete,
      }
    })), [notes, handleNoteUpdate, handleNoteDelete]);

    const zonesWithCallbacks = useMemo(() => zones.map(zone => ({
      ...zone,
      data: {
        ...zone.data,
        onUpdate: handleZoneUpdate,
        onDelete: handleZoneDelete,
        onCreateTableAtPosition,
        onCreateNoteAtPosition
      }
    })), [zones, handleZoneUpdate, handleZoneDelete, onCreateTableAtPosition, onCreateNoteAtPosition]);

    const combinedNodes = useMemo((): ProcessedNode[] => {
      // Process nodes to set draggable property based on zone locking
      const processedNodes = visibleNodes.map(node => ({
        ...node,
        data: {
          ...node.data,
          onDelete: handleTableDelete,
        },
        draggable: !isLocked && !isNodeInLockedZone(node, zonesWithCallbacks)
      }));

      const processedNotes = notesWithCallbacks.map(note => ({
        ...note,
        data: {
          ...note.data,
          isPositionLocked: isLocked || isNodeInLockedZone(note, zonesWithCallbacks)
        },
        draggable: !isLocked && !isNodeInLockedZone(note, zonesWithCallbacks)
      }));

      const processedZones = zonesWithCallbacks.map(zone => ({
        ...zone,
        draggable: !isLocked && !zone.data.isLocked
      }));

      return [...processedNodes, ...processedNotes, ...processedZones];
    }, [visibleNodes, notesWithCallbacks, zonesWithCallbacks, isLocked, handleTableDelete]);

    const onBeforeDelete = async ({ nodes }: { nodes: ProcessedNode[]; edges: ProcessedEdge[] }) => {
      if (nodes.length > 0) {
        const tableNodes = nodes.filter(node => node.type === "table");
        const nonTableNodes = nodes.filter(node => node.type !== "table");
        // Soft delete tables only
        if (tableNodes.length > 0) {
          const tableNodeIds = tableNodes.map(node => node.id);
          deleteNodes(tableNodeIds);
        }
        return nonTableNodes.length > 0;
      }
      return true
    };

    return (
      <div className="w-full h-full" ref={reactFlowWrapper}>
        <ContextMenu>
          <ContextMenuTrigger>
            <ReactFlow
              nodes={combinedNodes}
              edges={processedEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onBeforeDelete={onBeforeDelete} //prevent table permanent delete
              onConnect={onConnect}
              onSelectionChange={onSelectionChange}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onInit={onInit}
              onEdgeMouseEnter={onEdgeMouseEnter}
              onEdgeMouseLeave={onEdgeMouseLeave}
              onPaneContextMenu={onPaneContextMenu}
              onPaneMouseMove={onPaneMouseMove}
              onViewportChange={handleViewportChange}
              nodesConnectable={!isLocked}
              elementsSelectable={!isLocked}
              snapToGrid={settings.snapToGrid}
              deleteKeyCode={isLocked ? null : ["Delete"]}
              fitView
              colorMode={theme as ColorMode}
            >
              <Controls showInteractive={false}>
                <ControlButton onClick={handleLockChange} title={isLocked ? "Unlock" : "Lock"}>
                  {isLocked ? <IoLockClosedOutline size={18} /> : <IoLockOpenOutline size={18} />}
                </ControlButton>
                <ControlButton onClick={handleSnapToGridChange} title={"Snap To Grid"}>
                  {settings.snapToGrid ? <Grid2x2Check size={18} /> : <Magnet size={18} />}
                </ControlButton>
              </Controls>
              <Background />
            </ReactFlow>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem
              onSelect={() => {
                if (clickPositionRef.current && rfInstanceRef.current) {
                  const flowPosition = rfInstanceRef.current.screenToFlowPosition(clickPositionRef.current);
                  onCreateTableAtPosition(flowPosition);
                }
              }}
              disabled={isLocked}
            >
              <Plus className="h-4 w-4 mr-2" /> Add New Table
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => {
                if (clickPositionRef.current && rfInstanceRef.current) {
                  const flowPosition = rfInstanceRef.current.screenToFlowPosition(clickPositionRef.current);
                  onCreateNoteAtPosition(flowPosition);
                }
              }}
              disabled={isLocked}
            >
              <StickyNote className="h-4 w-4 mr-2" /> Add Note
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => {
                if (clickPositionRef.current && rfInstanceRef.current) {
                  const flowPosition = rfInstanceRef.current.screenToFlowPosition(clickPositionRef.current);
                  onCreateZoneAtPosition(flowPosition);
                }
              }}
              disabled={isLocked}
            >
              <SquareDashed className="h-4 w-4 mr-2" /> Add Zone
            </ContextMenuItem>
            {(clipboard?.length || 0) > 0 &&
              <ContextMenuItem
                onSelect={() => {
                  if (clickPositionRef.current && rfInstanceRef.current) {
                    const flowPosition = rfInstanceRef.current.screenToFlowPosition(clickPositionRef.current);
                    pasteNodes(flowPosition);
                  }
                }}
                disabled={isLocked || !clipboard || clipboard.length === 0}
              >
                <Clipboard className="h-4 w-4 mr-2" /> Paste {clipboard?.length || 0} Items
              </ContextMenuItem>
            }

          </ContextMenuContent>
        </ContextMenu>
      </div>
    );
  }
);

export default DiagramEditor;