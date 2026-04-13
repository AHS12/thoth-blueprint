import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { colors } from "@/lib/constants";
import { type TableNodeData } from "@/lib/types";
import { useStore } from "@/store/store";
import {
  Handle,
  Position,
  useUpdateNodeInternals,
  type NodeProps,
} from "@xyflow/react";
import { Copy, Key, MoreHorizontal, Sparkles, Trash2 } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "./ui/button";
import {
  PopoverWithArrow,
  PopoverWithArrowContent,
  PopoverWithArrowTrigger,
} from "./ui/popover-with-arrow";

interface TableNodeProps extends NodeProps {
  data: TableNodeData;
  onDelete?: (ids: string[]) => void;
  onCopy?: (ids: string[]) => void;
}

function areColumnsEqual(
  prevColumns: TableNodeData["columns"],
  nextColumns: TableNodeData["columns"]
): boolean {
  if (prevColumns === nextColumns) return true;
  if (prevColumns.length !== nextColumns.length) return false;

  for (let i = 0; i < prevColumns.length; i++) {
    const prev = prevColumns[i];
    const next = nextColumns[i];
    if (!prev || !next) return false;

    if (
      prev.id !== next.id ||
      prev.name !== next.name ||
      prev.type !== next.type ||
      prev.pk !== next.pk ||
      prev.nullable !== next.nullable ||
      prev.defaultValue !== next.defaultValue ||
      prev.isUnique !== next.isUnique ||
      prev.isAutoIncrement !== next.isAutoIncrement ||
      prev.comment !== next.comment ||
      prev.enumValues !== next.enumValues ||
      prev.length !== next.length ||
      prev.precision !== next.precision ||
      prev.scale !== next.scale ||
      prev.isUnsigned !== next.isUnsigned ||
      prev.charset !== next.charset ||
      prev.collation !== next.collation ||
      prev.isGenerated !== next.isGenerated ||
      prev.generatedExpression !== next.generatedExpression ||
      prev.generatedType !== next.generatedType
    ) {
      return false;
    }
  }

  return true;
}

function areIndicesEqual(
  prevIndices: TableNodeData["indices"],
  nextIndices: TableNodeData["indices"]
): boolean {
  if (prevIndices === nextIndices) return true;
  if (!prevIndices && !nextIndices) return true;
  if (!prevIndices || !nextIndices) return false;
  if (prevIndices.length !== nextIndices.length) return false;

  for (let i = 0; i < prevIndices.length; i++) {
    const prev = prevIndices[i];
    const next = nextIndices[i];
    if (!prev || !next) return false;

    if (
      prev.id !== next.id ||
      prev.name !== next.name ||
      prev.isUnique !== next.isUnique ||
      prev.type !== next.type
    ) {
      return false;
    }

    if (prev.columns.length !== next.columns.length) return false;
    for (let j = 0; j < prev.columns.length; j++) {
      if (prev.columns[j] !== next.columns[j]) return false;
    }
  }

  return true;
}

function TableNode({
  id,
  data,
  selected,
  onDelete,
  onCopy,
}: TableNodeProps) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const updateNodeInternals = useUpdateNodeInternals();
  const prevColumnsRef = useRef(data.columns);
  const selectedNodeId = useStore((state) => state.selectedNodeId);
  const isSelected = selected || selectedNodeId === id;
  const { selectedEdgeId, selectedDiagramId, diagramsMap, focusAiChatForTableNode } =
    useStore(
      useShallow((state) => ({
        selectedEdgeId: state.selectedEdgeId,
        selectedDiagramId: state.selectedDiagramId,
        diagramsMap: state.diagramsMap,
        focusAiChatForTableNode: state.focusAiChatForTableNode,
      })),
    );
  const edges = useMemo(
    () => (selectedDiagramId === null ? [] : diagramsMap.get(selectedDiagramId)?.data.edges || []),
    [selectedDiagramId, diagramsMap]
  );
  const selectedEdge = edges.find(e => e.id === selectedEdgeId);
  const isSourceTable = selectedEdge?.source === id;
  const isTargetTable = selectedEdge?.target === id;
  const sourceHandleParts = selectedEdge?.sourceHandle?.split("-") || [];
  const targetHandleParts = selectedEdge?.targetHandle?.split("-") || [];
  const sourceColId = sourceHandleParts.length > 2 ? sourceHandleParts.slice(0, -2).join("-") : "";
  const targetColId = targetHandleParts.length > 2 ? targetHandleParts.slice(0, -2).join("-") : "";



  // Create a Map for O(1) column lookups
  const columnsMap = useMemo(() => {
    const map = new Map<string, { name: string }>();
    data.columns.forEach(col => map.set(col.id, { name: col.name }));
    return map;
  }, [data.columns]);

  useEffect(() => {
    if (prevColumnsRef.current !== data.columns) {
      updateNodeInternals(id);
      prevColumnsRef.current = data.columns;
    }
  }, [id, data.columns, updateNodeInternals]);

  const cardStyle = {
    border: `1px solid ${isSelected ? data.color || colors.DEFAULT_TABLE_COLOR : "hsl(var(--border))"
      }`,
    boxShadow: isSelected
      ? `0 0 8px ${data.color || colors.DEFAULT_TABLE_COLOR}40`
      : "var(--tw-shadow, 0 0 #0000)",
    width: 288,
  };

  const handleStyle = {
    opacity: isSelected ? 1 : 0,
    transition: "opacity 0.15s ease-in-out",
  };

  const getColumnNameById = (id: string) => {
    return columnsMap.get(id)?.name || "unknown";
  };

  const handleCopyFromPopover = () => {
    onCopy?.([id]);
    setIsPopoverOpen(false);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <Card
          className="shadow-md react-flow__node-default bg-card group"
          style={cardStyle}
        >
          <CardHeader className="p-0 cursor-move relative">
            <div
              style={{
                height: "6px",
                backgroundColor: data.color || colors.DEFAULT_TABLE_COLOR,
                borderTopLeftRadius: "calc(var(--radius) - 1px)",
                borderTopRightRadius: "calc(var(--radius) - 1px)",
              }}
            ></div>
            <CardTitle className="text-sm text-center font-semibold p-2">
              {data.label}
            </CardTitle>
            <PopoverWithArrow open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
              <PopoverWithArrowTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-1/2 right-1 -translate-y-1/2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </PopoverWithArrowTrigger>
              <PopoverWithArrowContent
                side="top"
                align="center"
                className="z-[10000]"
              >
                <div className="space-y-2">
                  {data.comment && (
                    <div>
                      <p className="font-semibold text-foreground">Comment:</p>
                      <p className="text-muted-foreground break-words">
                        {data.comment}
                      </p>
                    </div>
                  )}
                  {data.indices && data.indices.length > 0 && (
                    <div>
                      <p className="font-semibold text-foreground mb-1">Indices:</p>
                      <div className="space-y-1">
                        {data.indices.map((index) => (
                          <div key={index.id} className="text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <span className="font-semibold text-foreground truncate">
                                {index.name}
                              </span>
                              {index.isUnique && (
                                <Badge
                                  variant="outline"
                                  className="px-1 py-0 text-[10px]"
                                >
                                  Unique
                                </Badge>
                              )}
                            </div>
                            <p className="break-all">
                              ({index.columns.map(getColumnNameById).join(", ")})
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <Separator />
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-auto py-1 px-2 text-xs"
                    onClick={handleCopyFromPopover}
                  >
                    <Copy className="h-3 w-3 mr-1" /> Copy Table
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full h-auto py-1 px-2 text-xs"
                    onClick={() => onDelete?.([id])}
                  >
                    <Trash2 className="h-3 w-3 mr-1" /> Delete Table
                  </Button>
                </div>
              </PopoverWithArrowContent>
            </PopoverWithArrow>
          </CardHeader>
          <CardContent className="p-0 divide-y">
            {data.columns?.map((col) => (
              <TooltipProvider key={col.id} delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={`relative flex justify-between items-center text-xs py-1.5 px-4 ${((isSourceTable && col.id === sourceColId) || (isTargetTable && col.id === targetColId)) ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}>
                      <Handle
                        type="target"
                        position={Position.Left}
                        id={`${col.id}-left-target`}
                        style={{
                          ...handleStyle,
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: data.color || colors.DEFAULT_TABLE_COLOR,
                        }}
                        className="!w-2.5 !h-2.5"
                      />
                      <Handle
                        type="source"
                        position={Position.Left}
                        id={`${col.id}-left-source`}
                        style={{
                          ...handleStyle,
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: data.color || colors.DEFAULT_TABLE_COLOR,
                        }}
                        className="!w-2.5 !h-2.5"
                      />
                      <div className="flex items-center gap-1 truncate">
                        {col.pk && (
                          <Key className="h-3 w-3 text-yellow-500 flex-shrink-0" />
                        )}
                        <span className="truncate">{col.name}</span>
                        {col.nullable && (
                          <span className="text-muted-foreground font-mono -ml-1 mr-1">
                            ?
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-muted-foreground">
                        {col.type}
                      </span>
                      <Handle
                        type="target"
                        position={Position.Right}
                        id={`${col.id}-right-target`}
                        style={{
                          ...handleStyle,
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: data.color || colors.DEFAULT_TABLE_COLOR,
                        }}
                        className="!w-2.5 !h-2.5"
                      />
                      <Handle
                        type="source"
                        position={Position.Right}
                        id={`${col.id}-right-source`}
                        style={{
                          ...handleStyle,
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: data.color || colors.DEFAULT_TABLE_COLOR,
                        }}
                        className="!w-2.5 !h-2.5"
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent
                    side="right"
                    align="start"
                    className="z-[10000] w-48 p-1.5 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex justify-between items-center font-semibold">
                        <span>{col.name}</span>
                        <span className="text-primary">{col.type}</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {col.pk && <Badge variant="outline">Primary</Badge>}
                        {col.isUnique && <Badge variant="outline">Unique</Badge>}
                        {col.nullable === false && (
                          <Badge variant="outline">Not Null</Badge>
                        )}
                        {col.isAutoIncrement && (
                          <Badge variant="outline">Autoincrement</Badge>
                        )}
                        {col.isUnsigned && (
                          <Badge variant="outline">Unsigned</Badge>
                        )}
                      </div>
                      {col.type.toUpperCase() === "ENUM" && col.enumValues && (
                        <div>
                          <p className="font-semibold text-foreground">Enum:</p>
                          <p className="text-muted-foreground break-all">
                            {col.enumValues}
                          </p>
                        </div>
                      )}
                      <div className="space-y-0.5 text-muted-foreground">
                        <p>
                          <span className="font-semibold text-foreground">
                            Default:
                          </span>{" "}
                          {col.defaultValue || "Not set"}
                        </p>
                        <p>
                          <span className="font-semibold text-foreground">
                            Comment:
                          </span>{" "}
                          {col.comment || "Not set"}
                        </p>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          </CardContent>
        </Card>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => onCopy?.([id])}>
          <Copy className="h-4 w-4 mr-2" /> Copy Table
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => focusAiChatForTableNode(id)}>
          <Sparkles className="h-4 w-4 mr-2" /> Chat with AI
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => onDelete?.([id])}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="h-4 w-4 mr-2" /> Delete Table
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

// Memoized TableNode component with custom comparison function
const MemoizedTableNode = React.memo(TableNode, (prevProps, nextProps) => {
  // Compare essential props that affect rendering
  return (
    prevProps.id === nextProps.id &&
    prevProps.selected === nextProps.selected &&
    prevProps.data.label === nextProps.data.label &&
    prevProps.data.comment === nextProps.data.comment &&
    prevProps.data.color === nextProps.data.color &&
    prevProps.data.isLocked === nextProps.data.isLocked &&
    prevProps.data.isDeleted === nextProps.data.isDeleted &&
    areColumnsEqual(prevProps.data.columns, nextProps.data.columns) &&
    areIndicesEqual(prevProps.data.indices, nextProps.data.indices)
  );
});

MemoizedTableNode.displayName = 'TableNode';

export default MemoizedTableNode;