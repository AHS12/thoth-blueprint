import { useStore } from "@/store/store";
import { showError, showSuccess } from "@/utils/toast";
import { saveAs } from "file-saver";
import { db } from "./db";
import { type AiChatSession, type AppState, type Diagram } from "./types";

interface BackupData {
  diagrams: Diagram[];
  appState: AppState[];
  aiChatSessions?: AiChatSession[];
}

export async function exportDbToJson() {
  try {
    const state = useStore.getState();
    const diagrams = state.diagrams;
    const selectedDiagramId = state.selectedDiagramId;
    const aiChatSessions = await db.aiChatSessions.toArray();

    const backupData: BackupData = {
      diagrams,
      appState: [{ key: "selectedDiagramId", value: selectedDiagramId || 0 }],
      aiChatSessions,
    };

    const jsonString = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    const timestamp = `${year}${month}${day}_${hours}${minutes}${seconds}`;

    saveAs(blob, `thoth_backup_${timestamp}.thot`);
    showSuccess("Project data saved successfully!");
  } catch (error) {
    console.error("Failed to save project data:", error);
    showError("Failed to save project data.");
  }
}

export async function importJsonToDb(jsonString: string) {
  try {
    const backupData = JSON.parse(jsonString) as BackupData;

    if (!backupData.diagrams || !Array.isArray(backupData.diagrams)) {
      throw new Error('Invalid save file format. Missing "diagrams" array.');
    }

    // Process the diagrams to ensure dates are proper Date objects
    const processedDiagrams = backupData.diagrams.map((d: Diagram) => {
      if (d.createdAt) d.createdAt = new Date(d.createdAt);
      if (d.updatedAt) d.updatedAt = new Date(d.updatedAt);
      if (d.deletedAt) d.deletedAt = new Date(d.deletedAt);
      return d;
    });

    let selectedDiagramId: number | null = null;
    if (backupData.appState && Array.isArray(backupData.appState)) {
      const selectedDiagramIdState = backupData.appState.find(
        (state: AppState) => state.key === "selectedDiagramId"
      );
      if (
        selectedDiagramIdState &&
        typeof selectedDiagramIdState.value === "number"
      ) {
        selectedDiagramId = selectedDiagramIdState.value;
      }
    }

    const importedSessions = (backupData.aiChatSessions ?? []).filter(
      (session) =>
        typeof session.diagramId === "number" &&
        processedDiagrams.some((diagram) => diagram.id === session.diagramId),
    );

    await db.transaction(
      "rw",
      db.diagrams,
      db.appState,
      db.aiChatSessions,
      async () => {
        await db.diagrams.clear();
        await db.diagrams.bulkPut(processedDiagrams);
        await db.aiChatSessions.clear();
        if (importedSessions.length > 0) {
          await db.aiChatSessions.bulkPut(importedSessions);
        }
        await db.appState.put({
          key: "selectedDiagramId",
          value: selectedDiagramId || 0,
        });
      },
    );

    useStore.setState({
      diagrams: processedDiagrams,
      diagramsMap: new Map(
        processedDiagrams.map((diagram) => [diagram.id!, diagram]),
      ),
      selectedDiagramId,
      selectedNodeId: null,
      selectedEdgeId: null,
      aiChatPinnedTableIds: [],
      aiChatPanelOpen: false,
      isLoading: false,
    });

    showSuccess("Save loaded successfully!");
  } catch (error) {
    console.error("Failed to load save:", error);
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred.";
    showError(`Failed to load save: ${errorMessage}`);
  }
}
