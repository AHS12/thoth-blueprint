import { useIsMobile } from "@/hooks/use-mobile";
import { useSidebarState } from "@/hooks/use-sidebar-state";
import { tableColors } from "@/lib/colors";
import { colors, KeyboardShortcuts } from "@/lib/constants";
import { ElementType, type AppEdge, type AppNode, type AppNoteNode, type AppZoneNode, type ProcessedEdge, type ProcessedNode } from "@/lib/types";
import { DEFAULT_NODE_SPACING, DEFAULT_TABLE_HEIGHT, DEFAULT_TABLE_WIDTH, findExistingRelationship, findNonOverlappingPosition, getCanvasDimensions } from "@/lib/utils";
import { useStore, type StoreState } from "@/store/store";
import { showError, showSuccess } from "@/utils/toast";
import { type ReactFlowInstance } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { AboutDialog } from "./AboutDialog";
import { AddElementDialog } from "./AddElementDialog";
import { AddNoteDialog } from "./AddNoteDialog";
import { AddRelationshipDialog } from "./AddRelationshipDialog";
import { AddTableDialog } from "./AddTableDialog";
import { AddZoneDialog } from "./AddZoneDialog";
import DiagramEditor from "./DiagramEditor";
import DiagramGallery from "./DiagramGallery";
import { DiagramLayout } from "./DiagramLayout";
import EditorSidebar from "./EditorSidebar";
import { ExportDialog } from "./ExportDialog";
import { HelpCenterDialog } from "./HelpCenterDialog";
import { PWAUpdateNotification } from "./PWAUpdateNotification";
import { ProductTour, type ProductTourStep } from "./ProductTour";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { UpdateDialog } from "./UpdateDialog";
import { WhatsNewDialog } from "./WhatsNewDialog";

interface LayoutProps {
  onInstallAppRequest: () => void;
}

const GUIDED_EXPERIENCE_OPENED_GALLERY_KEY = "guidedExperienceOpened.gallery";
const GUIDED_EXPERIENCE_OPENED_EDITOR_KEY = "guidedExperienceOpened.editor";
const ONBOARDING_COMPLETED_KEY = "onboardingCompleted";

function getGuidedExperienceOpenedKey(mode: "gallery" | "editor") {
  return mode === "editor"
    ? GUIDED_EXPERIENCE_OPENED_EDITOR_KEY
    : GUIDED_EXPERIENCE_OPENED_GALLERY_KEY;
}

export default function Layout({ onInstallAppRequest }: LayoutProps) {
  const selectedDiagramId = useStore((state) => state.selectedDiagramId);
  const isRelationshipDialogOpen = useStore((state) => state.isRelationshipDialogOpen);
  const diagramsMap = useStore((state) => state.diagramsMap);
  const isLoading = useStore((state) => state.isLoading);
  const isMobile = useIsMobile();

  const diagram = diagramsMap.get(selectedDiagramId || 0);
  const currentTourMode: "gallery" | "editor" = selectedDiagramId && diagram ? "editor" : "gallery";

  const existingTableNames = useMemo(() =>
    diagram?.data?.nodes?.map(n => n.data.label) ?? [],
    [diagram]
  );

  const existingZoneNames = useMemo(() =>
    (diagram?.data?.zones || []).map(z => z.data.name) ?? [],
    [diagram]
  )

  const { addNode, undoDelete, copyNodes, pasteNodes, lastCursorPosition, addEdge, setIsAddRelationshipDialogOpen } = useStore(
    useShallow((state: StoreState) => ({
      addNode: state.addNode,
      undoDelete: state.undoDelete,
      copyNodes: state.copyNodes,
      pasteNodes: state.pasteNodes,
      lastCursorPosition: state.lastCursorPosition,
      addEdge: state.addEdge,
      setIsAddRelationshipDialogOpen: state.setIsRelationshipDialogOpen,
    }))
  );

  const {
    // sidebarState,
    setSidebarState,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    isSidebarOpen,
    setIsSidebarOpen,
    handleOpenSidebar,
    sidebarPanelRef,
  } = useSidebarState();

  const [isAddTableDialogOpen, setIsAddTableDialogOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [isAddNoteDialogOpen, setIsAddNoteDialogOpen] = useState(false);
  const [isAddZoneDialogOpen, setIsAddZoneDialogOpen] = useState(false);
  const [isShortcutsDialogOpen, setIsShortcutsDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isHelpCenterOpen, setIsHelpCenterOpen] = useState(false);
  const [isAddElementDialogOpen, setIsAddElementDialogOpen] = useState(false);
  const [isWhatsNewOpen, setIsWhatsNewOpen] = useState(false);
  const [isProductTourOpen, setIsProductTourOpen] = useState(false);
  const [tourMode, setTourMode] = useState<"gallery" | "editor">("gallery");
  const [whatsNewMarkdown, setWhatsNewMarkdown] = useState<string>("");

  const [rfInstance, setRfInstance] = useState<ReactFlowInstance<ProcessedNode, ProcessedEdge> | null>(null);

  const galleryTourSteps: ProductTourStep[] = useMemo(() => [
    {
      id: "gallery-intro",
      title: "Welcome to ThothBlueprint",
      description: "This home screen gives you your project overview and core starting points.",
      target: '[data-tour="gallery-intro"]',
      placement: "bottom",
    },
    {
      id: "gallery-create",
      title: "Create Your First Diagram",
      description: "Use Create New to start from a blank schema and build visually.",
      target: '[data-tour="gallery-create"]',
      placement: "left",
    },
    {
      id: "gallery-import",
      title: "Import Existing Schema",
      description: "Already have SQL, DBML, or JSON? Import it and continue editing offline.",
      target: '[data-tour="gallery-import"]',
      placement: "left",
    },
    {
      id: "gallery-settings",
      title: "Help and Updates",
      description: "Open settings anytime for Help Center, updates, install options, and release notes.",
      target: '[data-tour="gallery-settings"]',
      placement: "bottom",
    },
  ], []);

  const editorTourSteps: ProductTourStep[] = useMemo(() => [
    {
      id: "editor-add-element",
      title: "Add Modeling Elements",
      description: "Use this plus button to add tables, notes, zones, and relationships quickly.",
      target: '[data-tour="editor-add-element"]',
      placement: "left",
    },
    {
      id: "editor-help-menu",
      title: "Help Menu",
      description: "Find the Help Center, What's New, shortcuts, and about info from here.",
      target: '[data-tour="editor-help-menu"]',
      placement: "bottom",
    },
    {
      id: "editor-control-lock",
      title: "Lock and Safety Controls",
      description: "Use lock control to prevent accidental edits while reviewing your diagram.",
      target: '[data-tour="editor-control-lock"]',
      placement: "left",
    },
    {
      id: "editor-control-reorganize",
      title: "Auto Reorganize",
      description: "Reorganize can clean up complex layouts while preserving relationship clarity.",
      target: '[data-tour="editor-control-reorganize"]',
      placement: "left",
    },
  ], []);

  const activeTourSteps = useMemo(
    () => tourMode === "editor" ? editorTourSteps : galleryTourSteps,
    [tourMode, editorTourSteps, galleryTourSteps]
  );

  // Auto-show What's New when app version changes and fetch local markdown
  useEffect(() => {
    const currentVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
    const lastSeenVersion = localStorage.getItem('whatsNewSeenVersion');
    if (currentVersion && currentVersion !== lastSeenVersion) {
      fetch('/whats-new.md')
        .then((res) => res.ok ? res.text() : Promise.reject(new Error('Failed to load whats-new.md')))
        .then((text) => {
          setWhatsNewMarkdown(text);
          setIsWhatsNewOpen(true);
        })
        .catch((err) => {
          console.error('Error loading whats-new.md', err);
          setWhatsNewMarkdown('# What\'s New\n\nUpdate available.');
          setIsWhatsNewOpen(true);
        });
    }
  }, []);

  // Manual open handler to view What's New on demand
  const openWhatsNew = () => {
    fetch('/whats-new.md')
      .then((res) => res.ok ? res.text() : Promise.reject(new Error('Failed to load whats-new.md')))
      .then((text) => {
        setWhatsNewMarkdown(text);
        setIsWhatsNewOpen(true);
      })
      .catch((err) => {
        console.error('Error loading whats-new.md', err);
        setWhatsNewMarkdown('# What\'s New\n\nUpdate available.');
        setIsWhatsNewOpen(true);
      });
  };

  const startProductTour = useCallback((markAsOpened = true) => {
    setTourMode(currentTourMode);
    setIsProductTourOpen(true);
    if (markAsOpened) {
      localStorage.setItem(getGuidedExperienceOpenedKey(currentTourMode), "true");
    }
  }, [currentTourMode]);

  const completeOnboarding = () => {
    localStorage.setItem(ONBOARDING_COMPLETED_KEY, "true");
  };

  useEffect(() => {
    if (isLoading) return;

    const tourOpenedKey = getGuidedExperienceOpenedKey(currentTourMode);
    const hasOpenedGuidedExperience = localStorage.getItem(tourOpenedKey) === "true";

    // First-time per-context users should see the guided experience once.
    if (!hasOpenedGuidedExperience) {
      startProductTour(false);
      localStorage.setItem(tourOpenedKey, "true");
      return;
    }
  }, [isLoading, currentTourMode, startProductTour]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (selectedDiagramId) {
        const target = event.target as HTMLElement;
        if (["INPUT", "TEXTAREA"].includes(target.tagName) || target.isContentEditable) {
          return;
        }
        // handle Ctrl+A to open table add dialog
        if ((event.ctrlKey || event.metaKey) && event.key === KeyboardShortcuts.ADD_NEW_TABLE) {
          event.preventDefault();
          if (!isAddTableDialogOpen) {
            setIsAddTableDialogOpen(true);
          }
        }
        // Handle Ctrl+B to toggle sidebar
        if ((event.ctrlKey || event.metaKey) && event.key === KeyboardShortcuts.SIDEBAR_TOGGLE) {
          event.preventDefault();
          if (isMobile) {
            // For mobile (sheet), toggle isSidebarOpen
            setIsSidebarOpen(!isSidebarOpen);
          } else {
            // For desktop (resizable panel), toggle via handleOpenSidebar
            handleOpenSidebar();
          }
        }
        //handle Ctrl+Z to undo table delete
        if ((event.ctrlKey || event.metaKey) && event.key === KeyboardShortcuts.UNDO_TABLE_DELETE) {
          event.preventDefault();
          undoDelete();
        }
        // Handle Ctrl+C to copy selected nodes
        if ((event.ctrlKey || event.metaKey) && event.key === KeyboardShortcuts.COPY_SELECTION) {
          event.preventDefault();
          if (!rfInstance) return;
          const selectedNodes = rfInstance.getNodes().filter(
            (n) => n.selected && (n.type === 'table' || n.type === 'note')
          ) as (AppNode | AppNoteNode)[];

          if (selectedNodes.length > 0) {
            copyNodes(selectedNodes);
            showSuccess(`${selectedNodes.length} item(s) copied to clipboard.`);
          }
        }
        // Handle Ctrl+V to paste nodes
        if ((event.ctrlKey || event.metaKey) && event.key === KeyboardShortcuts.PASTE_COPIED) {
          event.preventDefault();
          if (!rfInstance) return;

          // Use stored cursor position if available, otherwise use center of viewport
          let position;
          if (lastCursorPosition) {
            position = rfInstance.screenToFlowPosition(lastCursorPosition);
          } else {
            // Fallback to center of viewport
            const { x, y, zoom } = rfInstance.getViewport();
            position = {
              x: (window.innerWidth / 2 - x) / zoom,
              y: (window.innerHeight / 2 - y) / zoom
            };
          }

          pasteNodes(position);
        }
        // Handle Ctrl+Plus to zoom in
        if ((event.ctrlKey || event.metaKey) && (event.key === KeyboardShortcuts.ZOOM_IN_KEY_1 || event.key === KeyboardShortcuts.ZOOM_IN_KEY_2)) {
          event.preventDefault();
          if (rfInstance) {
            rfInstance.zoomIn({ duration: 200 });
          }
        }
        // Handle Ctrl+Minus to zoom out
        if ((event.ctrlKey || event.metaKey) && event.key === KeyboardShortcuts.ZOOM_OUT_KEY) {
          event.preventDefault();
          if (rfInstance) {
            rfInstance.zoomOut({ duration: 200 });
          }
        }
        // Handle Ctrl+0 to fit view
        if ((event.ctrlKey || event.metaKey) && event.key === KeyboardShortcuts.ZOOM_RESET_KEY) {
          event.preventDefault();
          if (rfInstance) {
            rfInstance.fitView({ duration: 200 });
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedDiagramId,
    isAddTableDialogOpen,
    handleOpenSidebar,
    undoDelete,
    isMobile,
    setIsSidebarOpen,
    isSidebarOpen,
    sidebarPanelRef,
    rfInstance,
    copyNodes,
    pasteNodes,
    lastCursorPosition
  ]);

  const handleSelectElementToAdd = (type: ElementType) => {
    setIsAddElementDialogOpen(false);
    if (type === 'table') {
      setIsAddTableDialogOpen(true);
    } else if (type === 'note') {
      setIsAddNoteDialogOpen(true);
    } else if (type === 'zone') {
      setIsAddZoneDialogOpen(true);
    } else if (type === 'relationship') {
      setIsAddRelationshipDialogOpen(true);
    }
  };

  const handleCreateTable = (tableName: string) => {
    if (!diagram) return;
    let defaultPosition = { x: 200, y: 200 };
    if (rfInstance) {
      const flowPosition = rfInstance.screenToFlowPosition({ x: window.innerWidth * 0.6, y: window.innerHeight / 2 });
      defaultPosition = { x: flowPosition.x - 144, y: flowPosition.y - 50 };
    }

    const visibleNodes = diagram.data.nodes.filter((n: AppNode) => !n.data.isDeleted) || [];
    const canvasDimensions = getCanvasDimensions();
    const viewportBounds = rfInstance ? {
      x: rfInstance.getViewport().x,
      y: rfInstance.getViewport().y,
      width: canvasDimensions.width,
      height: canvasDimensions.height,
      zoom: rfInstance.getViewport().zoom
    } : undefined;
    const nonOverlappingPosition = findNonOverlappingPosition(visibleNodes, defaultPosition, DEFAULT_TABLE_WIDTH, DEFAULT_TABLE_HEIGHT, DEFAULT_NODE_SPACING, viewportBounds);

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
  };

  const handleCreateNote = (text: string) => {
    let position = { x: 200, y: 200 };
    if (rfInstance) {
      const flowPosition = rfInstance.screenToFlowPosition({ x: window.innerWidth * 0.6, y: window.innerHeight / 2 });
      position = { x: flowPosition.x - 96, y: flowPosition.y - 96 };
    }
    const newNote: AppNoteNode = {
      id: `note-${+new Date()}`,
      type: "note",
      position,
      width: 192,
      height: 192,
      data: { text },
    };
    addNode(newNote);
  };

  const handleCreateZone = (name: string, color?: string) => {
    let position = { x: 200, y: 200 };
    if (rfInstance) {
      const flowPosition = rfInstance.screenToFlowPosition({ x: window.innerWidth * 0.6, y: window.innerHeight / 2 });
      position = { x: flowPosition.x - 150, y: flowPosition.y - 150 };
    }
    const newZone: AppZoneNode = {
      id: `zone-${+new Date()}`,
      type: "zone",
      position,
      width: 300,
      height: 300,
      zIndex: -1,
      data: { name, ...(color ? { color } : {}) },
    };
    addNode(newZone);
  };

  const handleCreateRelationship = (values: {
    sourceNodeId: string;
    sourceColumnId: string;
    targetNodeId: string;
    targetColumnId: string;
    relationshipType: string;
  }) => {
    if (!diagram) return;
    const { sourceNodeId, sourceColumnId, targetNodeId, targetColumnId, relationshipType } = values;

    // Create nodes map for O(1) lookups
    const nodesMap = new Map(diagram.data.nodes.map(node => [node.id, node]));

    const sourceNode = nodesMap.get(sourceNodeId);
    const targetNode = nodesMap.get(targetNodeId);

    if (!sourceNode || !targetNode) {
      showError("Source or target table not found.");
      return;
    }

    // Create column maps for O(1) lookups
    const sourceColumnsMap = new Map(sourceNode.data.columns.map(col => [col.id, col]));
    const targetColumnsMap = new Map(targetNode.data.columns.map(col => [col.id, col]));

    const sourceColumn = sourceColumnsMap.get(sourceColumnId);
    const targetColumn = targetColumnsMap.get(targetColumnId);

    if (!sourceColumn || !targetColumn) {
      showError("Source or target column not found.");
      return;
    }

    if (sourceColumn.type !== targetColumn.type) {
      showError("Cannot create relationship: Column types do not match.");
      return;
    }

    const sourceHandle = `${sourceColumnId}-right-source`;
    const targetHandle = `${targetColumnId}-left-target`;

    // Check for duplicate relationships
    const existingEdge = findExistingRelationship(
      diagram.data.edges || [],
      sourceNodeId,
      targetNodeId,
      sourceHandle,
      targetHandle
    );

    if (existingEdge) {
      showError("This relationship already exists.");
      return;
    }

    const newEdge: AppEdge = {
      id: `${sourceNodeId}-${targetNodeId}-${sourceHandle}-${targetHandle}`,
      source: sourceNodeId,
      target: targetNodeId,
      sourceHandle,
      targetHandle,
      type: "custom",
      data: { relationship: relationshipType },
    };

    addEdge(newEdge);
  };

  if (isLoading) {
    return null; // Or a loading spinner
  }

  const sidebarContent = diagram ? (
    <EditorSidebar
      onAddElement={() => { setIsAddElementDialogOpen(true); setIsSidebarOpen(false); }}
      onAddTable={() => { setIsAddTableDialogOpen(true); setIsSidebarOpen(false); }}
      onAddNote={() => { setIsAddNoteDialogOpen(true); setIsSidebarOpen(false); }}
      onAddZone={() => { setIsAddZoneDialogOpen(true); setIsSidebarOpen(false); }}
      onSetSidebarState={setSidebarState}
      onExport={() => setIsExportDialogOpen(true)}
      onCheckForUpdate={() => setIsUpdateDialogOpen(true)}
      onInstallAppRequest={onInstallAppRequest}
      onViewShortcuts={() => setIsShortcutsDialogOpen(true)}
      onViewAbout={() => setIsAboutDialogOpen(true)}
      onViewWhatsNew={openWhatsNew}
      onViewHelpCenter={() => setIsHelpCenterOpen(true)}
    />
  ) : null;

  return (
    <>
      <PWAUpdateNotification onUpdateNow={() => setIsUpdateDialogOpen(true)} />
      {selectedDiagramId && diagram ? (
        <DiagramLayout
          sidebarContent={sidebarContent}
          diagramContent={<DiagramEditor setRfInstance={setRfInstance} />}
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
          handleOpenSidebar={handleOpenSidebar}
          isSidebarCollapsed={isSidebarCollapsed}
          sidebarPanelRef={sidebarPanelRef}
          onCollapse={() => setIsSidebarCollapsed(true)}
          onExpand={() => setIsSidebarCollapsed(false)}
        />
      ) : (
        <div className="w-full h-screen">
          <DiagramGallery
            onInstallAppRequest={onInstallAppRequest}
            onCheckForUpdate={() => setIsUpdateDialogOpen(true)}
            onViewAbout={() => setIsAboutDialogOpen(true)}
            onViewWhatsNew={openWhatsNew}
            onViewHelpCenter={() => setIsHelpCenterOpen(true)}
          />
        </div>
      )}
      <AddElementDialog
        isOpen={isAddElementDialogOpen}
        onOpenChange={setIsAddElementDialogOpen}
        onSelect={handleSelectElementToAdd}
        tableCount={diagram?.data?.nodes?.filter(n => !n.data.isDeleted).length || 0}
      />
      <AddTableDialog isOpen={isAddTableDialogOpen} onOpenChange={setIsAddTableDialogOpen} onCreateTable={handleCreateTable} existingTableNames={existingTableNames} />
      <AddNoteDialog isOpen={isAddNoteDialogOpen} onOpenChange={setIsAddNoteDialogOpen} onCreateNote={handleCreateNote} />
      <AddZoneDialog isOpen={isAddZoneDialogOpen} onOpenChange={setIsAddZoneDialogOpen} onCreateZone={handleCreateZone} existingZoneNames={existingZoneNames} />
      <AddRelationshipDialog
        isOpen={isRelationshipDialogOpen}
        onOpenChange={setIsAddRelationshipDialogOpen}
        nodes={diagram?.data?.nodes?.filter(n => !n.data.isDeleted) || []}
        onCreateRelationship={handleCreateRelationship}
      />
      <ExportDialog isOpen={isExportDialogOpen} onOpenChange={setIsExportDialogOpen} diagram={diagram} rfInstance={rfInstance} />
      <UpdateDialog isOpen={isUpdateDialogOpen} onOpenChange={setIsUpdateDialogOpen} />
      <ShortcutsDialog isOpen={isShortcutsDialogOpen} onOpenChange={setIsShortcutsDialogOpen} />
      <AboutDialog isOpen={isAboutDialogOpen} onOpenChange={setIsAboutDialogOpen} />
      <HelpCenterDialog
        isOpen={isHelpCenterOpen}
        onOpenChange={setIsHelpCenterOpen}
        onStartTour={startProductTour}
        onViewShortcuts={() => setIsShortcutsDialogOpen(true)}
        onViewWhatsNew={openWhatsNew}
      />
      <WhatsNewDialog
        isOpen={isWhatsNewOpen}
        onOpenChange={(open) => {
          setIsWhatsNewOpen(open);
          if (!open) {
            const currentVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
            localStorage.setItem('whatsNewSeenVersion', currentVersion);
          }
        }}
        markdown={whatsNewMarkdown}
        onStartTour={startProductTour}
      />
      <ProductTour
        isOpen={isProductTourOpen}
        onOpenChange={setIsProductTourOpen}
        steps={activeTourSteps}
        onComplete={completeOnboarding}
        onSkip={completeOnboarding}
      />
    </>
  );
}