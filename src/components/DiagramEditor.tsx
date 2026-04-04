import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { tableColors } from "@/lib/colors";
import { colors, DbRelationship, relationshipTypes } from "@/lib/constants";
import { type AppEdge, type AppNode, type AppNoteNode, type AppZoneNode, type CombinedNode, type ProcessedEdge, type ProcessedNode } from "@/lib/types";
import { DEFAULT_NODE_SPACING, DEFAULT_TABLE_HEIGHT, DEFAULT_TABLE_WIDTH, findExistingRelationship, findNonOverlappingPosition, getCanvasDimensions, getColumnId, isNodeInLockedZone, isNodeInsideZone } from "@/lib/utils";
import { useStore, type StoreState } from "@/store/store";
import { showError, showSuccess } from "@/utils/toast";
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
import { Clipboard, GitCommitHorizontal, Grid2x2Check, LayoutGrid, Magnet, Move, Plus, Pointer, SquareDashed, StickyNote } from "lucide-react";
import { useTheme } from "next-themes";
import {
  forwardRef,
  useCallback,
  useEffect,
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
import { ReorganizeWarningDialog } from "./ReorganizeWarningDialog";
import TableNode from "./TableNode";
import ZoneNode from "./ZoneNode";

interface DiagramEditorProps {
  setRfInstance: (instance: ReactFlowInstance<ProcessedNode, ProcessedEdge> | null) => void;
}

const DiagramEditor = forwardRef(
  ({ setRfInstance }: DiagramEditorProps, ref) => {
    const selectedDiagramId = useStore((state) => state.selectedDiagramId);
    const diagramsMap = useStore((state) => state.diagramsMap);
    const onlyRenderVisibleElements = useStore((state) => state.onlyRenderVisibleElements);

    const diagram = useMemo(() =>
      selectedDiagramId !== null ? diagramsMap.get(selectedDiagramId) : undefined,
      [diagramsMap, selectedDiagramId]
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
      copyNodes,
      selectedNodeId,
      setSelectedNodeId,
      selectedEdgeId,
      setSelectedEdgeId,
      setLastCursorPosition,
      pasteNodes,
      clipboard,
      settings,
      updateSettings,
      setIsAddRelationshipDialogOpen,
      reorganizeTables,
      toggleLock,
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
        copyNodes: state.copyNodes,
        selectedNodeId: state.selectedNodeId,
        setSelectedNodeId: state.setSelectedNodeId,
        selectedEdgeId: state.selectedEdgeId,
        setSelectedEdgeId: state.setSelectedEdgeId,
        setLastCursorPosition: state.setLastCursorPosition,
        pasteNodes: state.pasteNodes,
        clipboard: state.clipboard,
        settings: state.settings,
        updateSettings: state.updateSettings,
        setIsAddRelationshipDialogOpen: state.setIsRelationshipDialogOpen,
        reorganizeTables: state.reorganizeTables,
        toggleLock: state.toggleLock,
      }))
    );
    const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
    const [isReorganizeDialogOpen, setIsReorganizeDialogOpen] = useState(false);
    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const { theme } = useTheme();
    const clickPositionRef = useRef<{ x: number; y: number } | null>(null);
    const [isSpacePressed, setIsSpacePressed] = useState(false);

    const nodes = useMemo(() => diagram?.data.nodes || [], [diagram?.data.nodes]);
    const edges = useMemo(() => diagram?.data.edges || [], [diagram?.data.edges]);
    const notes = useMemo(() => diagram?.data.notes || [], [diagram?.data.notes]);
    const zones = useMemo(() => diagram?.data.zones || [], [diagram?.data.zones]);
    const isLocked = useMemo(() => diagram?.data.isLocked ?? false, [diagram?.data.isLocked]);

    // Create Maps for efficient lookups
    const zonesMap = useMemo(() => new Map(zones.map(zone => [zone.id, zone])), [zones]);

    const edgeTypes = useMemo(() => ({ custom: CustomEdge }), []);
    const visibleNodes = useMemo(() => nodes.filter((n) => !n.data.isDeleted), [nodes]);

    // Memoize callback functions to prevent unnecessary re-renders
    const handleTableDelete = useCallback((ids: string[]) => {
      deleteNodes(ids);
    }, [deleteNodes]);

    const handleTableCopy = useCallback((ids: string[]) => {
      const { diagramsMap: latestDiagramsMap, selectedDiagramId: latestSelectedDiagramId } = useStore.getState();
      if (latestSelectedDiagramId === null) return;

      const activeDiagram = latestDiagramsMap.get(latestSelectedDiagramId);
      if (!activeDiagram) return;

      const tableMap = new Map((activeDiagram.data.nodes || []).map((node) => [node.id, node]));
      const nodesToCopy = ids
        .map((id) => tableMap.get(id))
        .filter((node): node is AppNode => Boolean(node) && !node?.data.isDeleted);

      if (nodesToCopy.length === 0) return;

      copyNodes(nodesToCopy);
      showSuccess(`${nodesToCopy.length} item(s) copied to clipboard.`);
    }, [copyNodes]);

    const handleNoteUpdate = useCallback((id: string, data: Partial<import('@/lib/types').NoteNodeData>) => {
      const { diagramsMap: latestDiagramsMap, selectedDiagramId: latestSelectedDiagramId } = useStore.getState();
      if (latestSelectedDiagramId === null) return;

      const activeDiagram = latestDiagramsMap.get(latestSelectedDiagramId);
      const note = activeDiagram?.data.notes?.find((n) => n.id === id);
      if (note) {
        updateNode({ ...note, data: { ...note.data, ...data } });
      }
    }, [updateNode]);

    const handleNoteDelete = useCallback((ids: string[]) => {
      deleteNodes(ids);
    }, [deleteNodes]);

    const handleZoneUpdate = useCallback((id: string, data: Partial<import('@/lib/types').ZoneNodeData>) => {
      const { diagramsMap: latestDiagramsMap, selectedDiagramId: latestSelectedDiagramId } = useStore.getState();
      if (latestSelectedDiagramId === null) return;

      const activeDiagram = latestDiagramsMap.get(latestSelectedDiagramId);
      const zone = activeDiagram?.data.zones?.find((z) => z.id === id);
      if (zone) {
        updateNode({ ...zone, data: { ...zone.data, ...data } });
      }
    }, [updateNode]);

    const handleZoneDelete = useCallback((ids: string[]) => {
      deleteNodes(ids);
    }, [deleteNodes]);

    const onCreateNoteAtPosition = useCallback((position: { x: number; y: number }) => {
      const newNote: AppNoteNode = {
        id: `note-${+new Date()}`, type: 'note', position, width: 192, height: 192, data: { text: 'New Note' },
      };
      addNode(newNote);
    }, [addNode]);

    const onCreateZoneAtPosition = useCallback((position: { x: number; y: number }) => {
      const { diagramsMap: latestDiagramsMap, selectedDiagramId: latestSelectedDiagramId } = useStore.getState();
      if (latestSelectedDiagramId === null) return;

      const activeDiagram = latestDiagramsMap.get(latestSelectedDiagramId);
      if (!activeDiagram) return;

      const visibleZones = activeDiagram.data.zones || [];
      const zoneName = `New Zone ${visibleZones.length + 1}`;
      const newZone: AppZoneNode = {
        id: `zone-${+new Date()}`, type: 'zone', position, width: 300, height: 300, zIndex: -1, data: { name: zoneName },
      };
      addNode(newZone);
    }, [addNode]);

    const onCreateTableAtPosition = useCallback((position: { x: number; y: number }) => {
      const {
        diagramsMap: latestDiagramsMap,
        selectedDiagramId: latestSelectedDiagramId,
        settings: latestSettings,
      } = useStore.getState();
      if (latestSelectedDiagramId === null) return;

      const activeDiagram = latestDiagramsMap.get(latestSelectedDiagramId);
      if (!activeDiagram) return;

      const visibleNodes = (activeDiagram.data.nodes || []).filter((n: AppNode) => !n.data.isDeleted);
      const tableName = `new_table_${visibleNodes.length + 1}`;
      const defaultPosition = { x: position.x - 144, y: position.y - 50 };
      const canvasDimensions = getCanvasDimensions();
      const viewportBounds = rfInstanceRef.current ? {
        x: rfInstanceRef.current.getViewport().x,
        y: rfInstanceRef.current.getViewport().y,
        width: canvasDimensions.width,
        height: canvasDimensions.height,
        zoom: rfInstanceRef.current.getViewport().zoom
      } : undefined;

      let finalPosition = defaultPosition;
      if (!latestSettings.allowTableOverlapDuringCreation) {
        finalPosition = findNonOverlappingPosition(visibleNodes, defaultPosition, DEFAULT_TABLE_WIDTH, DEFAULT_TABLE_HEIGHT, DEFAULT_NODE_SPACING, viewportBounds);
      }

      const newNode: AppNode = {
        id: `${tableName}-${+new Date()}`,
        type: "table",
        position: finalPosition,
        data: {
          label: tableName,
          color: tableColors[Math.floor(Math.random() * tableColors.length)] ?? colors.DEFAULT_TABLE_COLOR,
          columns: [{ id: `col_${Date.now()}`, name: "id", type: "INT", pk: true, nullable: false }],
          order: visibleNodes.length,
        },
      };
      addNode(newNode);
    }, [addNode]);

    // Memoize nodeTypes with callbacks to prevent recreation
    const memoizedNodeTypes = useMemo((): NodeTypes => ({
      table: (props: NodeProps<AppNode>) => (
        <TableNode
          {...props}
          onDelete={handleTableDelete}
          onCopy={handleTableCopy}
        />
      ),
      note: (props: NodeProps<AppNoteNode>) => (
        <NoteNode
          {...props}
          onUpdate={handleNoteUpdate}
          onDelete={handleNoteDelete}
        />
      ),
      zone: (props: NodeProps<AppZoneNode>) => (
        <ZoneNode
          {...props}
          onUpdate={handleZoneUpdate}
          onDelete={handleZoneDelete}
          onCreateTableAtPosition={onCreateTableAtPosition}
          onCreateNoteAtPosition={onCreateNoteAtPosition}
        />
      ),
    }), [handleTableDelete, handleTableCopy, handleNoteUpdate, handleNoteDelete, handleZoneUpdate, handleZoneDelete, onCreateTableAtPosition, onCreateNoteAtPosition]);

    useEffect(() => {
      if (selectedNodeId && rfInstanceRef.current && settings.focusTableDuringSelection) {
        const node = rfInstanceRef.current.getNode(selectedNodeId);
        if (node) {
          rfInstanceRef.current.fitView({
            nodes: [{ id: selectedNodeId }],
            duration: 300, // smooth transition
            maxZoom: 1.2,   // prevent zooming in too close
          });
        }
      }
    }, [selectedNodeId, settings.focusTableDuringSelection]);

    useEffect(() => {
      if (selectedEdgeId && rfInstanceRef.current && settings.focusRelDuringSelection) {
        const edge = rfInstanceRef.current.getEdge(selectedEdgeId);
        if (edge) {
          const sourceNodeId = edge?.source || '';
          const targetNodeId = edge?.target || '';
          rfInstanceRef.current.fitView({
            nodes: [{ id: sourceNodeId }, { id: targetNodeId }],
            duration: 300, // smooth transition
            maxZoom: 1.2,   // prevent zooming in too close
          });
        }
      }
    }, [selectedEdgeId, settings.focusRelDuringSelection]);

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
    const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
      setSelectedEdgeId(edge.id);
      setSelectedNodeId(null);
    }, [setSelectedEdgeId, setSelectedNodeId]);

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

    // Ref to store drag state
    const dragRef = useRef<{
      zoneId: string;
      initialZonePos: { x: number; y: number };
      childNodes: { id: string; initialPos: { x: number; y: number }; type: string }[];
    } | null>(null);

    const onNodeDragStart = useCallback((_: React.MouseEvent, node: ProcessedNode) => {
      if (node.type === 'zone') {
        const zone = zonesMap.get(node.id);
        if (!zone) return;

        const allNodes = rfInstanceRef.current?.getNodes() || [];
        const childNodes: { id: string; initialPos: { x: number; y: number }; type: string }[] = [];

        allNodes.forEach(n => {
          if (n.id === zone.id) return; // Skip the zone itself

          if ((n.type === 'table' || n.type === 'note') && !n.data.isDeleted) {
            if (isNodeInsideZone(n as unknown as CombinedNode, zone)) {
              childNodes.push({ id: n.id, initialPos: { ...n.position }, type: n.type });
            }
          }
        });

        dragRef.current = {
          zoneId: node.id,
          initialZonePos: { ...node.position },
          childNodes
        };
      }
    }, [zonesMap]);

    const onNodeDrag = useCallback((_: React.MouseEvent, node: ProcessedNode) => {
      if (dragRef.current && dragRef.current.zoneId === node.id) {
        const { diagramsMap: latestDiagramsMap, selectedDiagramId: latestSelectedDiagramId } = useStore.getState();
        if (latestSelectedDiagramId === null) return;

        const activeDiagram = latestDiagramsMap.get(latestSelectedDiagramId);
        if (!activeDiagram) return;

        const currentNodesMap = new Map((activeDiagram.data.nodes || []).map((n) => [n.id, n]));
        const currentNotesMap = new Map((activeDiagram.data.notes || []).map((n) => [n.id, n]));

        const dx = node.position.x - dragRef.current.initialZonePos.x;
        const dy = node.position.y - dragRef.current.initialZonePos.y;

        const nodesToUpdate: (AppNode | AppNoteNode | AppZoneNode)[] = [];

        dragRef.current.childNodes.forEach(child => {
          let originalNode: AppNode | AppNoteNode | undefined;
          if (child.type === 'table') originalNode = currentNodesMap.get(child.id);
          else if (child.type === 'note') originalNode = currentNotesMap.get(child.id);

          if (originalNode) {
            nodesToUpdate.push({
              ...originalNode,
              position: {
                x: child.initialPos.x + dx,
                y: child.initialPos.y + dy
              }
            } as AppNode | AppNoteNode);
          }
        });

        if (nodesToUpdate.length > 0) {
          batchUpdateNodes(nodesToUpdate as AppNode[]);
        }
      }
    }, [batchUpdateNodes]);

    const onNodeDragStop = useCallback(() => {
      dragRef.current = null;
    }, []);

    const handleLockChange = () => {
      toggleLock();
    };

    const handleSnapToGridChange = useCallback(() => {
      const snapToGrid = settings.snapToGrid;
      updateSettings({ snapToGrid: !snapToGrid });
    }, [settings.snapToGrid, updateSettings]);

    const onConnect: OnConnect = useCallback((connection: Connection) => {
      const { source, target, sourceHandle, targetHandle } = connection;
      if (!source || !target || !sourceHandle || !targetHandle) return;

      const { diagramsMap: latestDiagramsMap, selectedDiagramId: latestSelectedDiagramId } = useStore.getState();
      if (latestSelectedDiagramId === null) return;

      const activeDiagram = latestDiagramsMap.get(latestSelectedDiagramId);
      if (!activeDiagram) return;

      const nodesMap = new Map((activeDiagram.data.nodes || []).map((n) => [n.id, n]));

      const sourceNode = nodesMap.get(source);
      const targetNode = nodesMap.get(target);
      if (!sourceNode || !targetNode) return;

      const sourceColumnId = getColumnId(sourceHandle);
      const targetColumnId = getColumnId(targetHandle);
      const sourceColumn = sourceNode.data.columns.find(c => c.id === sourceColumnId);
      const targetColumn = targetNode.data.columns.find(c => c.id === targetColumnId);
      if (!sourceColumn || !targetColumn) return;

      if (sourceColumn.type !== targetColumn.type) {
        showError("Cannot create relationship: Column types do not match.");
        return;
      }

      // Check for duplicate relationships
      const existingEdge = findExistingRelationship(
        edges,
        source,
        target,
        sourceHandle,
        targetHandle
      );

      if (existingEdge) {
        showError("This relationship already exists.");
        return;
      }

      const newEdge: AppEdge = {
        ...connection,
        id: `${source}-${target}-${sourceHandle}-${targetHandle}`,
        type: "custom",
        data: { relationship: relationshipTypes[1]?.value || DbRelationship.ONE_TO_MANY },
      };
      addEdgeToStore(newEdge);
    }, [edges, addEdgeToStore]);

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



    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.code === "Space") {
          const activeTag = (document.activeElement?.tagName || "").toLowerCase();
          if (activeTag !== "input" && activeTag !== "textarea" && activeTag !== "select") {
            e.preventDefault();
            setIsSpacePressed(true);
          }
        }
      };
      const handleKeyUp = (e: KeyboardEvent) => {
        if (e.code === "Space") {
          setIsSpacePressed(false);
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);
      return () => {
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("keyup", handleKeyUp);
      };
    }, []);

    const onPaneContextMenu = useCallback((event: React.MouseEvent | MouseEvent) => {
      const pane = reactFlowWrapper.current?.getBoundingClientRect();
      if (!pane) return;
      clickPositionRef.current = { x: event.clientX, y: event.clientY };
      setLastCursorPosition({ x: event.clientX, y: event.clientY });
    }, [setLastCursorPosition]);

    const onPaneMouseMove = useCallback((event: React.MouseEvent | MouseEvent) => {
      setLastCursorPosition({ x: event.clientX, y: event.clientY });
    }, [setLastCursorPosition]);

    const handleReorganizeClick = useCallback(() => {
      setIsReorganizeDialogOpen(true);
    }, []);

    const handleReorganizeConfirm = useCallback(() => {
      reorganizeTables();
      setIsReorganizeDialogOpen(false);
    }, [reorganizeTables]);

    const handleReorganizeCancel = useCallback(() => {
      setIsReorganizeDialogOpen(false);
    }, []);

    useImperativeHandle(ref, () => ({
      undoDelete,
      batchUpdateNodes,
    }));

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
    }, [visibleNodes, notesWithCallbacks, zonesWithCallbacks, isLocked]);

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
        {(clipboard?.length || 0) > 0 && (
          <div className="absolute right-4 top-4 z-[11] pointer-events-none">
            <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-xs shadow-md">
              <Clipboard className="h-3.5 w-3.5" />
              <span>{clipboard?.length || 0} copied</span>
            </div>
          </div>
        )}
        <ContextMenu>
          <ContextMenuTrigger>
            <ReactFlow
              nodes={combinedNodes}
              edges={processedEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeDragStart={onNodeDragStart}
              onNodeDrag={onNodeDrag}
              onNodeDragStop={onNodeDragStop}
              onBeforeDelete={onBeforeDelete} //prevent table permanent delete
              onConnect={onConnect}
              onSelectionChange={onSelectionChange}
              nodeTypes={memoizedNodeTypes}
              edgeTypes={edgeTypes}
              onInit={onInit}
              onEdgeMouseEnter={onEdgeMouseEnter}
              onEdgeMouseLeave={onEdgeMouseLeave}
              onEdgeClick={onEdgeClick}
              onPaneContextMenu={onPaneContextMenu}
              onPaneMouseMove={onPaneMouseMove}
              onViewportChange={handleViewportChange}
              nodesConnectable={!isLocked}
              elementsSelectable={!isLocked}
              snapToGrid={settings.snapToGrid}
              deleteKeyCode={isLocked ? null : ["Delete"]}
              panOnDrag={settings.enableFreePanning || isSpacePressed}
              selectionOnDrag={!isSpacePressed}
              fitView
              colorMode={theme as ColorMode}
              onlyRenderVisibleElements={onlyRenderVisibleElements}
            >
              <Controls showInteractive={false}>
                <ControlButton onClick={handleLockChange} title={isLocked ? "Unlock" : "Lock"} data-tour="editor-control-lock">
                  {isLocked ? <IoLockClosedOutline size={18} /> : <IoLockOpenOutline size={18} />}
                </ControlButton>
                <ControlButton onClick={handleSnapToGridChange} title={"Snap To Grid"} data-tour="editor-control-snap">
                  {settings.snapToGrid ? <Grid2x2Check size={18} /> : <Magnet size={18} />}
                </ControlButton>
                <ControlButton onClick={() => updateSettings({ enableFreePanning: !settings.enableFreePanning })} title={settings.enableFreePanning ? "Disable Free Panning" : "Enable Free Panning"}>
                  {settings.enableFreePanning ? <Move size={18} /> : <Pointer size={18} />}
                </ControlButton>
                <ControlButton onClick={handleReorganizeClick} title={"Reorganize Tables"} disabled={isLocked} data-tour="editor-control-reorganize">
                  <LayoutGrid size={18} />
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
              <Plus className="h-4 w-4 mr-2" /> Add Table
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => { setIsAddRelationshipDialogOpen(true) }}
              disabled={isLocked}
            >
              <GitCommitHorizontal className="h-4 w-4 mr-2" /> Add Relationship
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
        <ReorganizeWarningDialog
          open={isReorganizeDialogOpen}
          onOpenChange={setIsReorganizeDialogOpen}
          onConfirm={handleReorganizeConfirm}
          onCancel={handleReorganizeCancel}
          zones={zones}
          nodes={visibleNodes}
        />
      </div>
    );
  }
);

export default DiagramEditor;