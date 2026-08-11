import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { type AppNode } from "@/lib/types";
import { useStore, type StoreState } from "@/store/store";
import { showError } from "@/utils/toast";
import {
    closestCenter,
    DndContext,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import TableAccordionContent from "./TableAccordionContent";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";

interface TablesTabProps {
    nodes: AppNode[];
    isLocked: boolean;
    focusIndexTarget?: {
        tableId: string;
        indexId: string;
    } | null;
    onFocusIndexHandled?: () => void;
}

function SortableAccordionItem({
    node,
    children,
    itemRef,
}: {
    node: AppNode;
    children: (
        attributes: Record<string, unknown>,
        listeners: Record<string, unknown>
    ) => React.ReactNode;
    itemRef: (el: HTMLDivElement | null) => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition } =
        useSortable({ id: node.id });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const combinedRef = (el: HTMLDivElement | null) => {
        setNodeRef(el);
        itemRef(el);
    };

    return (
        <div ref={combinedRef} style={style}>
            {children(
                attributes as unknown as Record<string, unknown>,
                listeners || {}
            )}
        </div>
    );
}

export default function TablesTab({
    nodes: initialNodes,
    isLocked,
    focusIndexTarget,
    onFocusIndexHandled,
}: TablesTabProps) {
    const selectedNodeId = useStore((state) => state.selectedNodeId);

      const {
        setSelectedNodeId,
        setSelectedEdgeId,
      } = useStore(
        useShallow((state: StoreState) => ({
          setSelectedNodeId: state.setSelectedNodeId,
          setSelectedEdgeId: state.setSelectedEdgeId,
        }))
      );

    const { updateNode, batchUpdateNodes } = useStore(
        useShallow((state: StoreState) => ({
            updateNode: state.updateNode,
            batchUpdateNodes: state.batchUpdateNodes,
        }))
    );

    const [nodes, setNodes] = useState<AppNode[]>(initialNodes);
    const [editingTableName, setEditingTableName] = useState<string | null>(null);
    const [tableName, setTableName] = useState("");
    const [tableFilter, setTableFilter] = useState<string>("");
    const itemRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    );

    useEffect(() => {
        setNodes(initialNodes);
    }, [initialNodes]);

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    useEffect(() => {
        if (selectedNodeId) {
            const itemEl = itemRefs.current.get(selectedNodeId);
            // The accordion animation takes a moment. A small timeout ensures the element is in its final position.
            const scrollTimeout = setTimeout(() => {
                if (itemEl) {
                    itemEl.scrollIntoView({
                        behavior: 'smooth',
                        block: 'nearest',
                    });
                }
            }, 20); // shadcn accordion animation is 200ms

            return () => clearTimeout(scrollTimeout);
        }
    }, [selectedNodeId]);

    const filteredTables = useMemo(() => {
        if (!tableFilter) return nodes;
        return nodes.filter((node) =>
            node.data.label.toLowerCase().includes(tableFilter.toLowerCase())
        );
    }, [nodes, tableFilter]);

    const handleStartEdit = (node: AppNode) => {
        setEditingTableName(node.id);
        setTableName(node.data.label);
    };

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setTableName(e.target.value);
    };

    const handleNameSave = (node: AppNode) => {
        const trimmedTableName = tableName.trim();

        if (!trimmedTableName) {
            showError("Table name cannot be empty.");
            setTableName(node.data.label);
            setEditingTableName(null);
            return;
        }

        const otherTableNames = nodes
            .filter(n => n.id !== node.id)
            .map(n => n.data.label);

        if (otherTableNames.includes(trimmedTableName)) {
            showError("A table with this name already exists in this diagram.");
            setTableName(node.data.label);
            setEditingTableName(null);
            return;
        }

        updateNode({ ...node, data: { ...node.data, label: trimmedTableName } });
        setEditingTableName(null);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = nodes.findIndex((n) => n.id === active.id);
            const newIndex = nodes.findIndex((n) => n.id === over.id);

            const reorderedNodes = arrayMove(nodes, oldIndex, newIndex);
            setNodes(reorderedNodes);

            const nodesToUpdate = reorderedNodes.map((node, index) => ({
                ...node,
                data: {
                    ...node.data,
                    order: index,
                },
            }));

            batchUpdateNodes(nodesToUpdate);
        }
    };

    const handleSetSelectedNodeId = (id:string) => {
        setSelectedNodeId(id);
        setSelectedEdgeId(null);
    }

    return (
        <div className="flex flex-col h-full">
            {/* Filter */}
            <div className="px-4 mt-1 pb-2 flex-shrink-0">
                <div className="relative">
                    <Input
                        placeholder="Filter tables..."
                        value={tableFilter}
                        onChange={(e) => setTableFilter(e.target.value)}
                        className="pr-8"
                    />
                    {tableFilter && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                            onClick={() => setTableFilter("")}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 pl-4 overflow-hidden">
                <ScrollArea className="h-full">
                    <div className="pr-4">
                        {filteredTables.length > 0 ? (
                            <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragEnd={handleDragEnd}
                            >
                                <SortableContext
                                    items={filteredTables.map((n) => n.id)}
                                    strategy={verticalListSortingStrategy}
                                >
                                    <Accordion
                                        type="single"
                                        collapsible
                                        value={selectedNodeId ?? ""}
                                        onValueChange={(value) => handleSetSelectedNodeId(value)}
                                        className="w-full space-y-1"
                                    >
                                        {filteredTables.map((node) => (
                                            <SortableAccordionItem
                                                key={node.id}
                                                node={node}
                                                itemRef={(el) => itemRefs.current.set(node.id, el)}
                                            >
                                                {(attributes, listeners) => (
                                                    <AccordionItem
                                                        value={node.id}
                                                        className="border rounded-md data-[state=open]:bg-accent/50"
                                                    >
                                                        <AccordionTrigger className="px-2 group hover:no-underline">
                                                            <div className="flex items-center gap-2 w-full">
                                                                <div
                                                                    {...attributes}
                                                                    {...(isLocked ? {} : listeners)}
                                                                    className={
                                                                        isLocked
                                                                            ? "cursor-not-allowed p-1 -ml-1"
                                                                            : "cursor-grab p-1 -ml-1"
                                                                    }
                                                                >
                                                                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                                                                </div>
                                                                <div
                                                                    className="w-2 h-2 rounded-full"
                                                                    style={{ backgroundColor: node.data.color }}
                                                                />
                                                                {editingTableName === node.id ? (
                                                                    <Input
                                                                        value={tableName}
                                                                        onChange={handleNameChange}
                                                                        onBlur={() => handleNameSave(node)}
                                                                        onKeyDown={(e) =>
                                                                            e.key === "Enter" && handleNameSave(node)
                                                                        }
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        className="h-8"
                                                                        autoFocus
                                                                    />
                                                                ) : (
                                                                    <span
                                                                        className="truncate"
                                                                        onDoubleClick={
                                                                            isLocked
                                                                                ? undefined
                                                                                : () => handleStartEdit(node)
                                                                        }
                                                                    >
                                                                        {node.data.label}
                                                                    </span>
                                                                )}
                                                                <div className="flex-grow" />
                                                            </div>
                                                        </AccordionTrigger>
                                                        <AccordionContent>
                                                            <TableAccordionContent
                                                                node={node}
                                                                onStartEdit={() => handleStartEdit(node)}
                                                                focusIndexId={
                                                                    focusIndexTarget?.tableId === node.id
                                                                        ? focusIndexTarget.indexId
                                                                        : undefined
                                                                }
                                                                onFocusIndexHandled={onFocusIndexHandled}
                                                            />
                                                        </AccordionContent>
                                                    </AccordionItem>
                                                )}
                                            </SortableAccordionItem>
                                        ))}
                                    </Accordion>
                                </SortableContext>
                            </DndContext>
                        ) : (
                            <div className="text-center py-10">
                                {tableFilter ? (
                                    <>
                                        <p className="text-sm text-muted-foreground">
                                            No tables found matching your filter.
                                        </p>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="mt-4"
                                            onClick={() => setTableFilter("")}
                                        >
                                            <X className="h-4 w-4 mr-2" />
                                            Clear Filter
                                        </Button>
                                    </>
                                ) : (
                                    <p className="text-sm text-muted-foreground">
                                        No tables in this diagram yet.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </div>
        </div>
    );
}
