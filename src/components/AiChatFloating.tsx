import { cn } from "@/lib/utils";
import { useStore } from "@/store/store";
import { Sparkles } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import AiChatTab from "./AiChatTab";
import { Button } from "./ui/button";

export function AiChatFloating() {
  const { selectedDiagramId, diagramsMap, aiChatPanelOpen, setAiChatPanelOpen } =
    useStore(
      useShallow((s) => ({
        selectedDiagramId: s.selectedDiagramId,
        diagramsMap: s.diagramsMap,
        aiChatPanelOpen: s.aiChatPanelOpen,
        setAiChatPanelOpen: s.setAiChatPanelOpen,
      })),
    );

  const isLocked = useMemo(() => {
    if (!selectedDiagramId) return false;
    return diagramsMap.get(selectedDiagramId)?.data.isLocked ?? false;
  }, [diagramsMap, selectedDiagramId]);

  useEffect(() => {
    if (!aiChatPanelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector('[data-state="open"][role="dialog"]')) return;
      setAiChatPanelOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aiChatPanelOpen, setAiChatPanelOpen]);

  if (!selectedDiagramId) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[35] overflow-visible">
      {aiChatPanelOpen ? (
        <button
          type="button"
          className="pointer-events-auto absolute inset-0 z-0 bg-background/40 lg:hidden"
          aria-label="Dismiss assistant"
          onClick={() => setAiChatPanelOpen(false)}
        />
      ) : null}

      <div className="pointer-events-none absolute bottom-6 right-6 z-[1] flex flex-col items-end gap-3">
        {aiChatPanelOpen ? (
          <div
            className={cn(
              "pointer-events-auto flex h-[min(92dvh,760px)] w-[min(calc(100vw-2rem),28rem)] min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl ring-1 ring-border/50 backdrop-blur-sm",
            )}
          >
            <AiChatTab
              isLocked={isLocked}
              variant="floating"
              onRequestClose={() => setAiChatPanelOpen(false)}
            />
          </div>
        ) : null}

        <Button
          type="button"
          size="icon"
          variant={aiChatPanelOpen ? "secondary" : "default"}
          className={cn(
            "pointer-events-auto h-12 w-12 rounded-full shadow-lg",
            !aiChatPanelOpen && "ring-2 ring-background/80",
          )}
          onClick={() => setAiChatPanelOpen(!aiChatPanelOpen)}
          aria-expanded={aiChatPanelOpen}
          aria-label={
            aiChatPanelOpen ? "Close schema assistant" : "Open schema assistant"
          }
          data-tour="editor-ai-chat"
        >
          <Sparkles className="h-5 w-5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
