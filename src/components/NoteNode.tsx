import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { type AppNoteNode, type NoteNodeData } from "@/lib/types";
import { cn } from "@/lib/utils";
import { type NodeProps, NodeResizer } from "@xyflow/react";
import { Pencil, Trash2 } from "lucide-react";
import React, { useState } from "react";
import { EditNoteDialog } from "./EditNoteDialog";

interface NoteNodeProps extends NodeProps<AppNoteNode> {
  onUpdate?: (id: string, data: Partial<NoteNodeData>) => void;
  onDelete?: (ids: string[]) => void;
}

function NoteNode({ id, data, selected, onUpdate, onDelete }: NoteNodeProps) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const isLocked = data.isPositionLocked || false;

  return (
    <ContextMenu>
      <ContextMenuTrigger disabled={isLocked}>
        <div
          className={cn(
            "w-full h-full p-3 shadow-md rounded-md font-sans text-sm bg-yellow-200 text-yellow-900 border-2 border-transparent transition-colors group relative",
            selected && "border-blue-500"
          )}
          style={{
            transform: "rotate(-2deg)",
          }}
        >
          <NodeResizer
            minWidth={120}
            minHeight={120}
            isVisible={selected && !isLocked}
            lineClassName="border-blue-400"
            handleClassName="h-3 w-3 bg-white border-2 rounded-full border-blue-400"
          />
          {/* Static text display */}
          <div className="w-full h-full bg-transparent p-0 m-0 whitespace-pre-wrap break-words">
            {data.text || ""}
          </div>
          {/* Hover edit icon */}
          {!isLocked && (
            <button
              type="button"
              aria-label="Edit note"
              onClick={(e) => { e.stopPropagation(); setIsEditOpen(true); }}
              className="absolute top-2 right-2 p-1 rounded hover:bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onSelect={() => {
            if (onDelete && !isLocked) {
              onDelete([id]);
            }
          }}
          className="text-destructive focus:text-destructive"
          disabled={isLocked}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete Note
        </ContextMenuItem>
      </ContextMenuContent>
      {/* Edit dialog */}
      {!isLocked && (
        <EditNoteDialog
          isOpen={isEditOpen}
          onOpenChange={setIsEditOpen}
          initialText={data.text || ""}
          onUpdateNote={(text) => {
            if (onUpdate) onUpdate(id, { text });
          }}
        />
      )}
    </ContextMenu>
  );
}

// Memoized NoteNode component with comparison function
const MemoizedNoteNode = React.memo(NoteNode, (prevProps, nextProps) => {
  // Compare essential props that affect rendering
  return (
    prevProps.id === nextProps.id &&
    prevProps.selected === nextProps.selected &&
    prevProps.data.text === nextProps.data.text &&
    prevProps.data.color === nextProps.data.color &&
    prevProps.data.isPositionLocked === nextProps.data.isPositionLocked
  );
});

MemoizedNoteNode.displayName = 'NoteNode';

export default MemoizedNoteNode;