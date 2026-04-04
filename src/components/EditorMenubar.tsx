import { CheckpointHistoryDialog } from "@/components/CheckpointHistoryDialog";
import { CheckpointSettingsDialog } from "@/components/CheckpointSettingsDialog";
import { ManualCheckpointDialog } from "@/components/ManualCheckpointDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "@/components/ui/menubar";
import { usePWA } from "@/hooks/usePWA";
import { exportDbToJson } from "@/lib/backup";
import { CtrlKey, KeyboardShortcuts } from "@/lib/constants";
import { type DiagramCheckpoint } from "@/lib/types";
import { useStore, type StoreState } from "@/store/store";
import { showError, showSuccess } from "@/utils/toast";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";

const CHECKPOINT_MIGRATION_ACK_VERSION_KEY = "checkpointMigrationAcknowledgedVersion";
const CHECKPOINT_MIGRATION_PREFERENCE_KEY = "checkpointMigrationPreference";

interface EditorMenubarProps {
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

export default function EditorMenubar({
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
}: EditorMenubarProps) {
  const selectedDiagramId = useStore((state) => state.selectedDiagramId);
  const diagramsMap = useStore((state) => state.diagramsMap);

  const diagram = useMemo(() =>
    diagramsMap.get(selectedDiagramId || 0),
    [diagramsMap, selectedDiagramId]
  );

  const {
    moveDiagramToTrash,
    setSelectedDiagramId,
    undoDelete,
    settings,
    updateSettings,
    setIsRelationshipDialogOpen,
    createCheckpoint,
    listCheckpoints,
    restoreCheckpoint,
    runCheckpointMigration,
  } = useStore(
    useShallow((state: StoreState) => ({
      moveDiagramToTrash: state.moveDiagramToTrash,
      setSelectedDiagramId: state.setSelectedDiagramId,
      undoDelete: state.undoDelete,
      settings: state.settings,
      updateSettings: state.updateSettings,
      setIsRelationshipDialogOpen: state.setIsRelationshipDialogOpen,
      createCheckpoint: state.createCheckpoint,
      listCheckpoints: state.listCheckpoints,
      restoreCheckpoint: state.restoreCheckpoint,
      runCheckpointMigration: state.runCheckpointMigration,
    }))
  );

  const { setTheme } = useTheme();
  const { isInstalled } = usePWA();
  const [isCheckpointHistoryOpen, setIsCheckpointHistoryOpen] = useState(false);
  const [isCheckpointSettingsOpen, setIsCheckpointSettingsOpen] = useState(false);
  const [isManualCheckpointOpen, setIsManualCheckpointOpen] = useState(false);
  const [isEnablingCheckpointMigration, setIsEnablingCheckpointMigration] = useState(false);
  const [isCheckpointMigrationEnabled, setIsCheckpointMigrationEnabled] = useState(
    () => localStorage.getItem(CHECKPOINT_MIGRATION_PREFERENCE_KEY) === "enabled",
  );
  const [checkpoints, setCheckpoints] = useState<DiagramCheckpoint[]>([]);

  useEffect(() => {
    const refreshMigrationEnabledState = () => {
      setIsCheckpointMigrationEnabled(
        localStorage.getItem(CHECKPOINT_MIGRATION_PREFERENCE_KEY) === "enabled",
      );
    };

    window.addEventListener("storage", refreshMigrationEnabledState);
    window.addEventListener("focus", refreshMigrationEnabledState);
    document.addEventListener("visibilitychange", refreshMigrationEnabledState);

    return () => {
      window.removeEventListener("storage", refreshMigrationEnabledState);
      window.removeEventListener("focus", refreshMigrationEnabledState);
      document.removeEventListener("visibilitychange", refreshMigrationEnabledState);
    };
  }, []);

  if (!diagram) return null;
  const isLocked = diagram.data.isLocked ?? false;

  const handleDeleteDiagram = () => {
    if (diagram) {
      moveDiagramToTrash(diagram.id!);
      setSelectedDiagramId(null);
    }
  };

  const onBackToGallery = () => {
    setSelectedDiagramId(null);
  };

  const refreshCheckpoints = async () => {
    const list = await listCheckpoints(diagram.id);
    setCheckpoints(list);
  };

  const handleCreateManualCheckpoint = async (label?: string) => {
    try {
      const checkpoint = await createCheckpoint("manual", "manual-user-action", label);
      if (checkpoint) {
        showSuccess(`Created checkpoint #${checkpoint.checkpointNumber}.`);
        setIsManualCheckpointOpen(false);
      }
    } catch (error) {
      console.error("Failed to create manual checkpoint:", error);
      showError("Failed to create checkpoint.");
    }
  };

  const handleRestoreCheckpoint = async (checkpointId: number) => {
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
  };

  const handleEnableCheckpointMigrationNow = async () => {
    if (isCheckpointMigrationEnabled || isEnablingCheckpointMigration) {
      return;
    }

    setIsEnablingCheckpointMigration(true);
    try {
      // Keep the menu action consistent with the modal flow.
      exportDbToJson();

      const result = await runCheckpointMigration();
      const currentVersion =
        typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";
      localStorage.setItem(CHECKPOINT_MIGRATION_PREFERENCE_KEY, "enabled");
      localStorage.setItem(CHECKPOINT_MIGRATION_ACK_VERSION_KEY, currentVersion);
      setIsCheckpointMigrationEnabled(true);
      if (!result.skipped) {
        showSuccess(`Checkpoint migration completed (${result.migratedCount} created).`);
      }
    } catch (error) {
      console.error("Failed to enable checkpoint migration:", error);
      showError("Could not enable checkpoint migration.");
    } finally {
      setIsEnablingCheckpointMigration(false);
    }
  };

  const updateCheckpointSettings = (overrides: Partial<typeof settings.checkpoints>) => {
    updateSettings({
      checkpoints: {
        ...settings.checkpoints,
        ...overrides,
      },
    });
  };

  return (
    <Menubar className="rounded-none border-none bg-transparent">
      <MenubarMenu>
        <MenubarTrigger className="px-2" data-tour="editor-file-menu">File</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={onBackToGallery}>
            Back to Gallery
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={onExport}>Export Diagram</MenubarItem>
          <MenubarItem onClick={exportDbToJson}>Save Data</MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={() => setIsManualCheckpointOpen(true)}>Create Checkpoint</MenubarItem>
          <MenubarItem
            onClick={async () => {
              await refreshCheckpoints();
              setIsCheckpointHistoryOpen(true);
            }}
          >
            View Checkpoints
          </MenubarItem>
          <MenubarSeparator />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <MenubarItem
                onSelect={(e) => e.preventDefault()}
                className="text-destructive focus:text-destructive"
                disabled={isLocked}
              >
                Delete Diagram
              </MenubarItem>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Move to Trash?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will move the "{diagram.name}" diagram to the trash. You can restore it later from the gallery.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteDiagram}>Move to Trash</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger className="px-2" data-tour="editor-edit-menu">Edit</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={undoDelete} disabled={isLocked}>
            Undo Delete Table <MenubarShortcut>{CtrlKey} + {KeyboardShortcuts.UNDO_TABLE_DELETE.toUpperCase()}</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={onAddTable} disabled={isLocked}>
            Add Table <MenubarShortcut>{CtrlKey} + {KeyboardShortcuts.ADD_NEW_TABLE.toUpperCase()}</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={() => setIsRelationshipDialogOpen(true)} disabled={isLocked}>
            Add Relationship
          </MenubarItem>
          <MenubarItem onClick={onAddNote} disabled={isLocked}>
            Add Note
          </MenubarItem>
          <MenubarItem onClick={onAddZone} disabled={isLocked}>
            Add Zone
          </MenubarItem>
          <MenubarSeparator />
          <MenubarCheckboxItem
            checked={settings.snapToGrid}
            onCheckedChange={(checked) => updateSettings({ snapToGrid: checked })}
          >
            Snap To Editor Grid
          </MenubarCheckboxItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger className="px-2">View</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={() => onSetSidebarState("hidden")}>
            Hide Sidebar
          </MenubarItem>
          <MenubarCheckboxItem
            checked={settings.focusTableDuringSelection}
            onCheckedChange={(checked) => updateSettings({ focusTableDuringSelection: checked })}
          >
            Focus During Table Selection
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={settings.focusRelDuringSelection}
            onCheckedChange={(checked) => updateSettings({ focusRelDuringSelection: checked })}
          >
            Focus During Relationship Selection
          </MenubarCheckboxItem>
          <MenubarSeparator />
          <MenubarCheckboxItem
            checked={settings.enableFreePanning}
            onCheckedChange={(checked) => updateSettings({ enableFreePanning: checked })}
          >
            Enable Free Panning
          </MenubarCheckboxItem>
          <MenubarSeparator />
          <MenubarCheckboxItem
            checked={settings.rememberLastPosition}
            onCheckedChange={(checked) => updateSettings({ rememberLastPosition: checked })}
          >
            Remember Last Editor Position
          </MenubarCheckboxItem>
          <MenubarSeparator />
          <MenubarCheckboxItem
            checked={settings.allowTableOverlapDuringCreation}
            onCheckedChange={(checked) => updateSettings({ allowTableOverlapDuringCreation: checked })}
          >
            Allow Table Overlap During Creation
          </MenubarCheckboxItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger className="px-2">Settings</MenubarTrigger>
        <MenubarContent>
          <MenubarSub>
            <MenubarSubTrigger>Theme</MenubarSubTrigger>
            <MenubarSubContent>
              <MenubarItem onClick={() => setTheme("light")}>
                Light
              </MenubarItem>
              <MenubarItem onClick={() => setTheme("dark")}>
                Dark
              </MenubarItem>
              <MenubarItem onClick={() => setTheme("system")}>
                System
              </MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <MenubarCheckboxItem
            checked={settings.exportForeignKeyConstraint}
            onCheckedChange={(checked) => updateSettings({ exportForeignKeyConstraint: checked })}
          >
            Export Foreign Key Constraint
          </MenubarCheckboxItem>
          <MenubarItem onClick={onCheckForUpdate}>
            Check for Updates
          </MenubarItem>
          {!isInstalled && (
            <MenubarItem onClick={onInstallAppRequest}>
              Install App
            </MenubarItem>
          )}
          <MenubarSeparator />
          <MenubarCheckboxItem
            checked={settings.checkpoints.enabled}
            onCheckedChange={(checked) => updateCheckpointSettings({ enabled: checked })}
          >
            Enable Automatic Checkpoints
          </MenubarCheckboxItem>
          <MenubarItem onClick={() => setIsCheckpointSettingsOpen(true)}>
            Checkpoint Settings
          </MenubarItem>
          {!isCheckpointMigrationEnabled && (
            <MenubarItem
              onClick={handleEnableCheckpointMigrationNow}
              disabled={isEnablingCheckpointMigration}
            >
              {isEnablingCheckpointMigration
                ? "Enabling Checkpoints..."
                : "Enable Checkpoints Now"}
            </MenubarItem>
          )}
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger className="px-2" data-tour="editor-help-menu">Help</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={onViewHelpCenter}>Help Center</MenubarItem>
          <MenubarItem onClick={onViewAbout}>About</MenubarItem>
          <MenubarItem onClick={onViewWhatsNew}>What's New</MenubarItem>
          <MenubarItem onClick={onViewShortcuts}>
            View Shortcuts
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <CheckpointHistoryDialog
        isOpen={isCheckpointHistoryOpen}
        onOpenChange={setIsCheckpointHistoryOpen}
        checkpoints={checkpoints}
        onRestore={handleRestoreCheckpoint}
        onCreateCheckpoint={() => {
          setIsCheckpointHistoryOpen(false);
          setIsManualCheckpointOpen(true);
        }}
      />
      <CheckpointSettingsDialog
        isOpen={isCheckpointSettingsOpen}
        onOpenChange={setIsCheckpointSettingsOpen}
        settings={settings.checkpoints}
        onSave={(nextSettings) => updateSettings({ checkpoints: nextSettings })}
      />
      <ManualCheckpointDialog
        isOpen={isManualCheckpointOpen}
        onOpenChange={setIsManualCheckpointOpen}
        onCreate={handleCreateManualCheckpoint}
      />
    </Menubar>
  );
}