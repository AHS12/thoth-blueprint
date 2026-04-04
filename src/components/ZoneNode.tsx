import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { type AppZoneNode, type ZoneNodeData } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useStore, type StoreState } from "@/store/store";
import { NodeResizer, useReactFlow, type NodeProps } from "@xyflow/react";
import { GitCommitHorizontal, Lock, Pencil, Plus, StickyNote, Trash2, Unlock } from "lucide-react";
import React, { useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { EditZoneDialog } from "./EditZoneDialog";

interface ZoneNodeProps extends NodeProps<AppZoneNode> {
  onUpdate?: (id: string, data: Partial<ZoneNodeData>) => void;
  onDelete?: (ids: string[]) => void;
  onCreateTableAtPosition?: (position: { x: number; y: number }) => void;
  onCreateNoteAtPosition?: (position: { x: number; y: number }) => void;
}

function ZoneNode({
  id,
  data,
  selected,
  onUpdate,
  onDelete,
  onCreateTableAtPosition,
  onCreateNoteAtPosition
}: ZoneNodeProps) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const { screenToFlowPosition } = useReactFlow();
  const contextMenuPositionRef = useRef<{ x: number; y: number } | null>(null);
  const { setIsAddRelationshipDialogOpen } = useStore(
    useShallow((state: StoreState) => ({
      setIsAddRelationshipDialogOpen: state.setIsRelationshipDialogOpen,
    }))
  );

  const diagramsMap = useStore((state) => state.diagramsMap);
  const selectedDiagramId = useStore((state) => state.selectedDiagramId);
  const existingZoneNames = useMemo(() => {
    const d = diagramsMap.get(selectedDiagramId || 0);
    return (d?.data?.zones || []).map((z) => z.data.name).filter((n) => !!n);
  }, [diagramsMap, selectedDiagramId]);

  const handleContextMenu = (event: React.MouseEvent) => {
    const position = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    contextMenuPositionRef.current = position;
  };

  const handleToggleLock = () => {
    if (onUpdate) {
      onUpdate(id, { isLocked: !data.isLocked });
    }
  };

  const { isLocked, color } = data;

  return (
    <ContextMenu>
      <ContextMenuTrigger onContextMenu={handleContextMenu}>
        <div
          className={cn(
            "w-full h-full rounded-lg border-2 group relative flex flex-col transition-colors duration-200",
            selected ? "border-blue-500" : "border-primary/20",
            isLocked ? "border-solid border-primary/40" : "border-dashed",
            !color && "bg-primary/5"
          )}
          style={{
            backgroundColor: color,
            borderColor: color ? color.replace('0.1)', '0.5)').replace('0.1', '0.5') : undefined
          }}
        >
          <NodeResizer
            minWidth={150}
            minHeight={150}
            isVisible={selected && !isLocked}
            lineClassName="border-blue-400"
            handleClassName="h-3 w-3 bg-white border-2 rounded-full border-blue-400"
          />
          <div className="flex items-center p-1 flex-shrink-0 relative">
            <div className="bg-transparent border-none text-foreground/80 font-semibold text-center w-full select-none truncate px-6">
              {data.name || "Zone"}
            </div>
            {!isLocked && (
              <button
                type="button"
                aria-label="Edit zone"
                onClick={(e) => { e.stopPropagation(); setIsEditOpen(true); }}
                className="absolute top-1 right-1 p-1 rounded hover:bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
            {isLocked && <Lock className="h-3 w-3 text-foreground/50 ml-1 flex-shrink-0 absolute top-2 right-2" />}
          </div>
          <div className="flex-grow" />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onSelect={handleToggleLock}
        >
          {isLocked ? (
            <>
              <Unlock className="h-4 w-4 mr-2" />
              Unlock Zone
            </>
          ) : (
            <>
              <Lock className="h-4 w-4 mr-2" />
              Lock Zone
            </>
          )}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            if (onCreateTableAtPosition && contextMenuPositionRef.current) {
              onCreateTableAtPosition(contextMenuPositionRef.current);
            }
          }}
          disabled={isLocked || false}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Table
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => { setIsAddRelationshipDialogOpen(true) }}
        >
          <GitCommitHorizontal className="h-4 w-4 mr-2" /> Add Relationship
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            if (onCreateNoteAtPosition && contextMenuPositionRef.current) {
              onCreateNoteAtPosition(contextMenuPositionRef.current);
            }
          }}
          disabled={isLocked || false}
        >
          <StickyNote className="h-4 w-4 mr-2" />
          Add Note
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            if (onDelete) {
              onDelete([id]);
            }
          }}
          className="text-destructive focus:text-destructive"
          disabled={isLocked || false}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete Zone
        </ContextMenuItem>
      </ContextMenuContent>
      {/* Edit dialog */}
      {!isLocked && (
        <EditZoneDialog
          isOpen={isEditOpen}
          onOpenChange={setIsEditOpen}
          initialName={data.name || ""}
          initialColor={data.color || ""}
          onUpdateZone={(name, color) => {
            if (onUpdate) onUpdate(id, { name, ...(color ? { color } : {}) });
          }}
          existingZoneNames={existingZoneNames}
          excludeName={data.name || ""}
        />
      )}
    </ContextMenu>
  );
}

// Memoized ZoneNode component with comparison function
const MemoizedZoneNode = React.memo(ZoneNode, (prevProps, nextProps) => {
  // Compare essential props that affect rendering
  return (
    prevProps.id === nextProps.id &&
    prevProps.selected === nextProps.selected &&
    prevProps.data.name === nextProps.data.name &&
    prevProps.data.color === nextProps.data.color &&
    prevProps.data.isLocked === nextProps.data.isLocked &&
    prevProps.width === nextProps.width &&
    prevProps.height === nextProps.height
  );
});

MemoizedZoneNode.displayName = 'ZoneNode';

export default MemoizedZoneNode;