import { dbTypeDisplay } from "@/lib/db-types";
import { type DiagramCheckpoint } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useStore } from "@/store/store";
import { showError, showSuccess } from "@/utils/toast";
import { formatDistanceToNow } from "date-fns";
import { FileCode2, GitCommitHorizontal, History, Plus, Table } from "lucide-react";
import React, { useMemo, useRef, useState } from "react";
import { CheckpointHistoryDialog } from "./CheckpointHistoryDialog";
import DbmlTab from "./DbmlTab";
import EditorMenubar from "./EditorMenubar";
import { DatabaseTypeIcon } from "./icons/DatabaseTypeIcon";
import RelationshipsTab from "./RelationshipsTab";
import TablesTab from "./TablesTab";
import { Button } from "./ui/button";

interface EditorSidebarProps {
  onAddElement: () => void;
  onAddTable: () => void;
  onAddNote: () => void;
  onAddZone: () => void;
  onSetSidebarState: (state: "docked" | "hidden") => void;
  onExport: () => void;
  onCheckForUpdate: () => void;
  onInstallAppRequest: () => void;
  onViewShortcuts: () => void;
  onViewAbout: () => void;
  onViewWhatsNew: () => void;
  onViewHelpCenter: () => void;
}

export default function EditorSidebar({
  onAddElement,
  onAddTable,
  onAddNote,
  onAddZone,
  onSetSidebarState,
  onExport,
  onCheckForUpdate,
  onInstallAppRequest,
  onViewShortcuts,
  onViewAbout,
  onViewWhatsNew,
  onViewHelpCenter,
}: EditorSidebarProps) {
  const selectedDiagramId = useStore((state) => state.selectedDiagramId);
  const diagramsMap = useStore((state) => state.diagramsMap);
  const selectedNodeId = useStore((state) => state.selectedNodeId);
  const selectedEdgeId = useStore((state) => state.selectedEdgeId);
  const listCheckpoints = useStore((state) => state.listCheckpoints);
  const restoreCheckpoint = useStore((state) => state.restoreCheckpoint);
  const createCheckpoint = useStore((state) => state.createCheckpoint);

  const diagram = useMemo(() =>
    diagramsMap.get(selectedDiagramId || 0),
    [diagramsMap, selectedDiagramId]
  );

  const [currentTab, setCurrentTab] = useState<string>(() => {
    // Set initial tab based on what's selected
    if (selectedEdgeId) return "relationships";
    if (selectedNodeId) return "tables";
    return "tables";
  });
  const [isCheckpointHistoryOpen, setIsCheckpointHistoryOpen] = useState(false);
  const [checkpoints, setCheckpoints] = useState<DiagramCheckpoint[]>([]);
  const [isDbmlDirty, setIsDbmlDirty] = useState(false);
  const manualTabOverrideRef = useRef(false);
  const previousSelectedNodeIdRef = useRef<string | null>(selectedNodeId);
  const previousSelectedEdgeIdRef = useRef<string | null>(selectedEdgeId);

  const nodes = useMemo(
    () =>
      (diagram?.data.nodes ?? [])
        .filter((n) => !n.data.isDeleted)
        .sort(
          (a, b) => (a.data.order ?? Infinity) - (b.data.order ?? Infinity)
        ),
    [diagram?.data.nodes]
  );

  const edges = useMemo(() => diagram?.data.edges ?? [], [diagram?.data.edges]);
  const isLocked = useMemo(() => diagram?.data.isLocked ?? false, [diagram?.data.isLocked]);

  const refreshCheckpoints = React.useCallback(async () => {
    if (!diagram?.id) {
      setCheckpoints([]);
      return;
    }

    try {
      const list = await listCheckpoints(diagram.id);
      setCheckpoints(list);
    } catch (error) {
      console.error("Failed to load checkpoints:", error);
    }
  }, [diagram?.id, listCheckpoints]);

  const openCheckpointBrowser = React.useCallback(async () => {
    await refreshCheckpoints();
    setIsCheckpointHistoryOpen(true);
  }, [refreshCheckpoints]);

  const handleRestoreCheckpoint = React.useCallback(async (checkpointId: number) => {
    try {
      const restored = await restoreCheckpoint(checkpointId);
      if (restored) {
        showSuccess("Checkpoint restored successfully.");
        setIsCheckpointHistoryOpen(false);
      }
    } catch (error) {
      console.error("Failed to restore checkpoint:", error);
      showError("Failed to restore checkpoint.");
    }
  }, [restoreCheckpoint]);

  const handleCreateCheckpointFromHistory = React.useCallback(async () => {
    try {
      const checkpoint = await createCheckpoint("manual", "manual-user-action");
      if (checkpoint) {
        showSuccess(`Created checkpoint #${checkpoint.checkpointNumber}.`);
        await refreshCheckpoints();
      }
    } catch (error) {
      console.error("Failed to create checkpoint:", error);
      showError("Failed to create checkpoint.");
    }
  }, [createCheckpoint, refreshCheckpoints]);

  // Auto-switch tabs based on selection
  const handleTabChange = (value: string) => {
    manualTabOverrideRef.current = true;
    setCurrentTab(value);
  };

  // Switch to appropriate tab when items are selected
  React.useEffect(() => {
    const selectionChanged =
      previousSelectedNodeIdRef.current !== selectedNodeId ||
      previousSelectedEdgeIdRef.current !== selectedEdgeId;

    if (selectionChanged) {
      manualTabOverrideRef.current = false;
      previousSelectedNodeIdRef.current = selectedNodeId;
      previousSelectedEdgeIdRef.current = selectedEdgeId;
    }

    if (manualTabOverrideRef.current) return;

    const hasSelectedRelationship =
      !!selectedEdgeId && edges.some((e) => e.id === selectedEdgeId);
    const hasSelectedTable =
      !!selectedNodeId && nodes.some((n) => n.id === selectedNodeId);

    if (hasSelectedRelationship && currentTab !== "relationships") {
      setCurrentTab("relationships");
      return;
    }

    if (hasSelectedTable && currentTab !== "tables") {
      setCurrentTab("tables");
    }
  }, [selectedNodeId, selectedEdgeId, nodes, edges, currentTab]);

  React.useEffect(() => {
    void refreshCheckpoints();
    const intervalId = window.setInterval(() => {
      void refreshCheckpoints();
    }, 30_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshCheckpoints]);

  if (!diagram) return null;

  return (
    <div className="h-full w-full flex flex-col bg-card" onContextMenu={(e) => e.preventDefault()}>
      {/* Header */}
      <div className="flex items-center border-b pl-2 flex-shrink-0">
        <img
          src="/ThothBlueprint-icon.svg"
          alt="ThothBlueprint Logo"
          className="h-5 w-5 mr-2 flex-shrink-0"
        />
        <EditorMenubar
          onAddTable={onAddTable}
          onAddNote={onAddNote}
          onAddZone={onAddZone}
          onSetSidebarState={onSetSidebarState}
          onExport={onExport}
          onCheckForUpdate={onCheckForUpdate}
          onInstallAppRequest={onInstallAppRequest}
          onViewShortcuts={onViewShortcuts}
          onViewAbout={onViewAbout}
          onViewWhatsNew={onViewWhatsNew}
          onViewHelpCenter={onViewHelpCenter}
        />
      </div>

      {/* Diagram Info */}
      <div className="p-2 flex-shrink-0 border-b">
        <div className="px-2 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2">
            <DatabaseTypeIcon dbType={diagram.dbType} className="h-4 sm:h-5 w-auto" />
            <div className="leading-tight">
              <h3 className="text-base sm:text-lg font-semibold tracking-tight truncate max-w-[16rem]">
                {diagram.name}
              </h3>
              <p className="text-[11px] sm:text-xs text-muted-foreground">{dbTypeDisplay[diagram.dbType]}</p>
            </div>
          </div>
          <div className="sm:hidden px-2 text-[11px] text-muted-foreground">
            Updated {formatDistanceToNow(new Date(diagram.updatedAt), { addSuffix: true })}
          </div>
        </div>
        <div className="mt-2 px-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] sm:text-xs text-muted-foreground">
          <span className="flex items-center whitespace-nowrap"><Table className="h-3 w-3 mr-1" /> {nodes.length} tables</span>
          <span className="flex items-center whitespace-nowrap"><GitCommitHorizontal className="h-3 w-3 mr-1" /> {edges.length} relationships</span>
          <button
            type="button"
            onClick={openCheckpointBrowser}
            data-tour="editor-checkpoint-history"
            className="flex items-center whitespace-nowrap hover:text-foreground transition-colors"
          >
            <History className="h-3 w-3 mr-1" /> {checkpoints.length} checkpoints
          </button>
          <span className="hidden sm:inline whitespace-nowrap">Updated {formatDistanceToNow(new Date(diagram.updatedAt), { addSuffix: true })}</span>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex-shrink-0 px-4 my-4">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-10 min-w-0 flex-1 items-center rounded-md bg-muted p-1 text-muted-foreground">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleTabChange("tables")}
              className={cn(
                "flex-1 min-w-0 relative h-8 rounded-sm px-2 lg:px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                currentTab === "tables"
                  ? "bg-background text-foreground shadow-sm hover:bg-background"
                  : "hover:bg-muted-foreground/10"
              )}
            >
              <Table className="h-4 w-4 mr-2" />
              <span className="hidden lg:inline">Tables</span>
              <span className="lg:hidden">Tbls</span>
              <span className="hidden xl:inline">&nbsp;({nodes.length})</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleTabChange("relationships")}
              className={cn(
                "flex-1 min-w-0 relative h-8 rounded-sm px-2 lg:px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                currentTab === "relationships"
                  ? "bg-background text-foreground shadow-sm hover:bg-background"
                  : "hover:bg-muted-foreground/10"
              )}
            >
              <GitCommitHorizontal className="h-4 w-4 mr-2" />
              <span className="hidden lg:inline">Relations</span>
              <span className="lg:hidden">Rels</span>
              <span className="hidden xl:inline">&nbsp;({edges.length})</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleTabChange("dbml")}
              className={cn(
                "flex-1 min-w-0 relative h-8 rounded-sm px-2 lg:px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                currentTab === "dbml"
                  ? "bg-background text-foreground shadow-sm hover:bg-background"
                  : "hover:bg-muted-foreground/10"
              )}
            >
              <FileCode2 className="h-4 w-4 mr-2" />
              <span>DBML</span>
              {isDbmlDirty && (
                <span className="ml-2 h-2 w-2 rounded-full bg-amber-500" aria-label="DBML has unsaved changes" />
              )}
            </Button>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="shrink-0"
            onClick={onAddElement}
            disabled={isLocked}
            data-tour="editor-add-element"
          >
            <Plus className="h-4 w-4" />
            <span className="sr-only">Add Element</span>
          </Button>
        </div>
      </div>

      {/* Tab Content - Only render active tab */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className={cn("h-full", currentTab !== "tables" && "hidden")}>
          <TablesTab
            nodes={nodes}
            isLocked={isLocked}
          />
        </div>
        <div className={cn("h-full", currentTab !== "relationships" && "hidden")}>
          <RelationshipsTab
            nodes={nodes}
            edges={edges}
          />
        </div>
        <div className={cn("h-full", currentTab !== "dbml" && "hidden")}>
          <DbmlTab
            diagram={diagram}
            isLocked={isLocked}
            onDirtyChange={setIsDbmlDirty}
          />
        </div>
      </div>
      <CheckpointHistoryDialog
        isOpen={isCheckpointHistoryOpen}
        onOpenChange={setIsCheckpointHistoryOpen}
        checkpoints={checkpoints}
        onRestore={handleRestoreCheckpoint}
        onCreateCheckpoint={handleCreateCheckpointFromHistory}
      />
    </div>
  );
}