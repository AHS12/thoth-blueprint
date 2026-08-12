import { colors } from "@/lib/constants";
import { dataTypes } from "@/lib/db-types";
import {
  type AppNode,
  type Column,
  type DatabaseType,
  type Index,
  type IndexType,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { useStore, type StoreState } from "@/store/store";
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
import {
  Check,
  ChevronsUpDown,
  Copy,
  Edit,
  GripVertical,
  HelpCircle,
  Key,
  MoreHorizontal,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ColorPicker } from "./ColorPicker";
import { CompositePKDialog } from "./CompositePKDialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./ui/accordion";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Separator } from "./ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Textarea } from "./ui/textarea";

interface TableAccordionContentProps {
  node: AppNode;
  onStartEdit: () => void;
  focusIndexId?: string;
  onFocusIndexHandled?: () => void;
}

function SortableColumnItem({
  col,
  index,
  availableTypes,
  handleColumnUpdate,
  handleDeleteColumn,
  handleDuplicateColumn,
  isLocked,
  dbType,
}: {
  col: Column;
  index: number;
  availableTypes: string[];
  handleColumnUpdate: (
    index: number,
    field: keyof Column,
    value: string | number | boolean | undefined
  ) => void;
  handleDeleteColumn: (index: number) => void;
  handleDuplicateColumn: (index: number) => void;
  isLocked: boolean;
  dbType: DatabaseType;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: col.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const [isTypePopoverOpen, setIsTypePopoverOpen] = useState(false);

  const upperType = col.type.toUpperCase();
  const needsLength =
    ["VARCHAR", "CHAR", "BINARY", "VARBINARY", "BIT"].includes(upperType) &&
    !(dbType === "postgres" && upperType === "VARCHAR");
  const needsPrecisionScale = ["DECIMAL", "NUMERIC"].includes(upperType);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="p-2 border rounded-md bg-background space-y-2"
    >
      <div className="flex items-center gap-2">
        <div
          {...attributes}
          {...(isLocked ? {} : listeners)}
          className={
            isLocked ? "cursor-not-allowed p-1 -ml-1" : "cursor-grab p-1 -ml-1"
          }
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
        <Input
          value={col.name}
          onChange={(e) => handleColumnUpdate(index, "name", e.target.value)}
          className="h-8 w-3/5"
          disabled={isLocked}
        />
        <Popover open={isTypePopoverOpen} onOpenChange={setIsTypePopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              className="h-8 w-2/5 justify-between font-normal"
              disabled={isLocked}
            >
              <span className="truncate">{col.type}</span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-0">
            <Command>
              <CommandInput placeholder="Search type..." />
              <CommandList>
                <CommandEmpty>No type found.</CommandEmpty>
                <CommandGroup>
                  {availableTypes.map((type) => (
                    <CommandItem
                      key={type}
                      value={type}
                      onSelect={(currentValue) => {
                        handleColumnUpdate(
                          index,
                          "type",
                          currentValue.toUpperCase()
                        );
                        setIsTypePopoverOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          col.type.toLowerCase() === type.toLowerCase()
                            ? "opacity-100"
                            : "opacity-0"
                        )}
                      />
                      {type}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex items-center gap-1 justify-end pl-8">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => handleDuplicateColumn(index)}
          disabled={isLocked}
        >
          <Copy
            className={`h-4 w-4 mr-2`}
          />
        </Button>
        {needsLength && (
          <Input
            type="number"
            placeholder="Len"
            value={col.length ?? ""}
            onChange={(e) =>
              handleColumnUpdate(
                index,
                "length",
                e.target.value ? parseInt(e.target.value, 10) : undefined
              )
            }
            className="h-8 w-16"
            disabled={isLocked}
          />
        )}

        {needsPrecisionScale && (
          <>
            <Input
              type="number"
              placeholder="M"
              value={col.precision ?? ""}
              onChange={(e) =>
                handleColumnUpdate(
                  index,
                  "precision",
                  e.target.value ? parseInt(e.target.value, 10) : undefined
                )
              }
              className="h-8 w-16"
              disabled={isLocked}
            />
            <Input
              type="number"
              placeholder="D"
              value={col.scale ?? ""}
              onChange={(e) =>
                handleColumnUpdate(
                  index,
                  "scale",
                  e.target.value ? parseInt(e.target.value, 10) : undefined
                )
              }
              className="h-8 w-16"
              disabled={isLocked}
            />
          </>
        )}

        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => handleColumnUpdate(index, "nullable", !col.nullable)}
          disabled={isLocked}
        >
          <HelpCircle
            className={`h-4 w-4 ${col.nullable ? "text-blue-500" : "text-muted-foreground"
              }`}
          />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => handleColumnUpdate(index, "pk", !col.pk)}
          disabled={isLocked}
        >
          <Key
            className={`h-4 w-4 ${col.pk ? "text-yellow-500" : "text-muted-foreground"
              }`}
          />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={isLocked}>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              disabled={isLocked}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-64 p-2 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1">
              <Label htmlFor={`default-${index}`}>Default Value</Label>
              <Input
                id={`default-${index}`}
                placeholder="NULL"
                value={col.defaultValue?.toString() ?? ""}
                onChange={(e) =>
                  handleColumnUpdate(index, "defaultValue", e.target.value)
                }
                disabled={isLocked}
              />
            </div>
            {["ENUM", "SET"].includes(col.type.toUpperCase()) && (
              <div className="space-y-1">
                <Label htmlFor={`enum-${index}`}>
                  {col.type.toUpperCase()} Values
                </Label>
                <Input
                  id={`enum-${index}`}
                  placeholder="Use , for batch input"
                  value={col.enumValues ?? ""}
                  onChange={(e) =>
                    handleColumnUpdate(index, "enumValues", e.target.value)
                  }
                  disabled={isLocked}
                />
              </div>
            )}
            <div className="flex items-center space-x-2">
              <Checkbox
                id={`unique-${index}`}
                checked={!!col.isUnique}
                onCheckedChange={(checked) =>
                  handleColumnUpdate(index, "isUnique", !!checked)
                }
                disabled={isLocked}
              />
              <Label htmlFor={`unique-${index}`}>Unique</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id={`autoincrement-${index}`}
                checked={!!col.isAutoIncrement}
                onCheckedChange={(checked) =>
                  handleColumnUpdate(index, "isAutoIncrement", !!checked)
                }
                disabled={isLocked}
              />
              <Label htmlFor={`autoincrement-${index}`}>Autoincrement</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id={`unsigned-${index}`}
                checked={!!col.isUnsigned}
                onCheckedChange={(checked) =>
                  handleColumnUpdate(index, "isUnsigned", !!checked)
                }
                disabled={isLocked}
              />
              <Label htmlFor={`unsigned-${index}`}>Unsigned</Label>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`comment-${index}`}>Comment</Label>
              <Textarea
                id={`comment-${index}`}
                placeholder="Column comment..."
                value={col.comment ?? ""}
                onChange={(e) =>
                  handleColumnUpdate(index, "comment", e.target.value)
                }
                disabled={isLocked}
              />
            </div>
            <Separator />
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => handleDuplicateColumn(index)}
              disabled={isLocked}
            >
              <Copy className="h-4 w-4 mr-2" />
              Duplicate Column
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={() => handleDeleteColumn(index)}
              disabled={isLocked}
            >
              Delete Column
            </Button>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export default function TableAccordionContent({
  node,
  onStartEdit,
  focusIndexId,
  onFocusIndexHandled,
}: TableAccordionContentProps) {
  const { diagramsMap, updateNode, deleteNodes, selectedDiagramId } = useStore(
    useShallow((state: StoreState) => ({
      diagramsMap: state.diagramsMap,
      updateNode: state.updateNode,
      deleteNodes: state.deleteNodes,
      selectedDiagramId: state.selectedDiagramId,
    }))
  );

  const diagram = diagramsMap.get(selectedDiagramId || 0);

  const [columns, setColumns] = useState<Column[]>([]);
  const [indices, setIndices] = useState<Index[]>([]);
  const [tableComment, setTableComment] = useState("");
  const [openAccordionItems, setOpenAccordionItems] = useState<string[]>([]);
  const [isPKDialogOpen, setIsPKDialogOpen] = useState(false);
  const indexItemRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  // Create a Map for O(1) column lookups
  const columnsMap = useMemo(() => {
    const map = new Map<string, Column>();
    columns.forEach(col => map.set(col.id, col));
    return map;
  }, [columns]);

  const dbType = diagram?.dbType ?? 'mysql';
  const isLocked = diagram?.data.isLocked ?? false;
  const availableTypes = dataTypes[dbType] ?? [];
  const sensors = useSensors(useSensor(PointerSensor));

  const indexTypeLabels: Record<IndexType, string> = {
    INDEX: "Default",
    UNIQUE: "Unique",
    FULLTEXT: "Fulltext",
    SPATIAL: "Spatial",
  };

  useEffect(() => {
    if (node) {
      const columnsWithIds = (node.data.columns ?? []).map((col) => ({
        ...col,
        id: col.id ?? `col_${Math.random().toString(36).substring(2, 11)}`,
      }));
      setColumns(columnsWithIds);
      const indicesWithIds = (node.data.indices ?? []).map((idx) => ({
        ...idx,
        id: idx.id ?? `idx_${Math.random().toString(36).substring(2, 11)}`,
      }));
      setIndices(indicesWithIds);
      setTableComment(node.data.comment ?? "");
    }
  }, [node]);

  useEffect(() => {
    if (!focusIndexId || !indices.some((index) => index.id === focusIndexId)) {
      return;
    }

    setOpenAccordionItems((current) =>
      current.includes("indices") ? current : [...current, "indices"],
    );

    const focusTimeout = window.setTimeout(() => {
      indexItemRefs.current.get(focusIndexId)?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
      onFocusIndexHandled?.();
    }, 50);

    return () => window.clearTimeout(focusTimeout);
  }, [focusIndexId, indices, onFocusIndexHandled]);

  if (!node || !diagram) return null;

  const onNodeUpdate = (updatedNode: AppNode) => {
    updateNode(updatedNode);
  };

  const onNodeDelete = (nodeId: string) => {
    deleteNodes([nodeId]);
  };

  const handleAddColumn = () => {
    const newColumn: Column = {
      id: `col_${Date.now()}`,
      name: `new_column_${columns.length + 1}`,
      type: availableTypes[0] ?? "TEXT",
      nullable: true,
    };
    const newColumns = [...columns, newColumn];
    setColumns(newColumns);
    onNodeUpdate({ ...node, data: { ...node.data, columns: newColumns } });
  };

  const handleDeleteColumn = (index: number) => {
    const newColumns = columns.filter((_, i) => i !== index);
    setColumns(newColumns);
    onNodeUpdate({ ...node, data: { ...node.data, columns: newColumns } });
  };

  const handleDuplicateColumn = (index: number) => {
    const columnToDuplicate = columns[index];
    if (!columnToDuplicate) return;

    const duplicatedColumn: Column = {
      ...columnToDuplicate,
      id: `col_${Date.now()}`,
      name: `${columnToDuplicate.name}_copy`,
      pk: false,
    };
    const newColumns = [...columns];
    newColumns.splice(index + 1, 0, duplicatedColumn);
    setColumns(newColumns);
    onNodeUpdate({ ...node, data: { ...node.data, columns: newColumns } });
  };

  const handleColumnUpdate = (
    index: number,
    field: keyof Column,
    value: string | number | boolean | undefined
  ) => {
    const newColumns = [...columns];

    newColumns[index] = {
      ...newColumns[index],
      [field]: value,
    } as Column;

    setColumns(newColumns);
    onNodeUpdate({ ...node, data: { ...node.data, columns: newColumns } });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setColumns((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        const newColumns = arrayMove(items, oldIndex, newIndex);
        onNodeUpdate({ ...node, data: { ...node.data, columns: newColumns } });
        return newColumns;
      });
    }
  };

  const handleSavePK = (updatedColumns: Column[]) => {
    setColumns(updatedColumns);
    onNodeUpdate({ ...node, data: { ...node.data, columns: updatedColumns } });
  };

  const handleAddIndex = () => {
    const newIndex: Index = {
      id: `idx_${Date.now()}`,
      name: `${node.data.label}_index_${indices.length}`,
      columns: [],
      isUnique: false,
    };
    const newIndices = [...indices, newIndex];
    setIndices(newIndices);
    onNodeUpdate({ ...node, data: { ...node.data, indices: newIndices } });

    setOpenAccordionItems((prev) =>
      prev.includes("indices") ? prev : [...prev, "indices"]
    );
  };

  const handleIndexUpdate = (
    indexId: string,
    updatedFields: Partial<Index>
  ) => {
    const newIndices = indices.map((idx) =>
      idx.id === indexId ? { ...idx, ...updatedFields } : idx
    );
    setIndices(newIndices);
    onNodeUpdate({ ...node, data: { ...node.data, indices: newIndices } });
  };

  const handleDeleteIndex = (indexId: string) => {
    const newIndices = indices.filter((idx) => idx.id !== indexId);
    setIndices(newIndices);
    onNodeUpdate({ ...node, data: { ...node.data, indices: newIndices } });
  };

  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTableComment(e.target.value);
  };

  const handleCommentSave = () => {
    onNodeUpdate({ ...node, data: { ...node.data, comment: tableComment } });
  };

  const handleColorChange = (newColor: string) => {
    onNodeUpdate({ ...node, data: { ...node.data, color: newColor } });
  };

  return (
    <div className="space-y-4 px-1">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-semibold">Columns</h4>
          {columns.filter((c) => c.pk).length >= 2 && (
            <Badge variant="outline" className="text-xs font-normal text-yellow-500 border-yellow-500/40">
              <Key className="h-3 w-3 mr-1" />
              Composite PK ({columns.filter((c) => c.pk).length})
            </Badge>
          )}
        </div>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={columns.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {columns.map((col, index) => (
                <SortableColumnItem
                  key={col.id}
                  col={col}
                  index={index}
                  availableTypes={availableTypes}
                  handleColumnUpdate={handleColumnUpdate}
                  handleDeleteColumn={handleDeleteColumn}
                  handleDuplicateColumn={handleDuplicateColumn}
                  isLocked={isLocked}
                  dbType={dbType}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <div className="mt-4 flex gap-2">
          <Button
            className="flex-grow"
            onClick={handleAddColumn}
            disabled={isLocked}
          >
            <Plus className="h-4 w-4 mr-2" /> Add Column
          </Button>
          <Button
            className="flex-grow"
            variant="outline"
            onClick={handleAddIndex}
            disabled={isLocked}
          >
            <Plus className="h-4 w-4 mr-2" /> Add Index
          </Button>
          <Button
            variant="outline"
            onClick={() => setIsPKDialogOpen(true)}
            disabled={isLocked}
            title="Manage Primary Key"
          >
            <Key className="h-4 w-4" />
          </Button>
        </div>
        <CompositePKDialog
          open={isPKDialogOpen}
          onOpenChange={setIsPKDialogOpen}
          columns={columns}
          onSave={handleSavePK}
        />
      </div>
      <Separator />
      <Accordion
        type="multiple"
        className="w-full"
        value={openAccordionItems}
        onValueChange={setOpenAccordionItems}
      >
        <AccordionItem value="indices">
          <AccordionTrigger>Indices</AccordionTrigger>
          <AccordionContent className="space-y-2 pt-2">
            {indices.map((idx) => (
              <div
                key={idx.id}
                ref={(element) => indexItemRefs.current.set(idx.id, element)}
                data-index-id={idx.id}
                className="flex items-center gap-2 p-2 border rounded-md bg-background"
              >
                <Popover>
                  <PopoverTrigger asChild disabled={isLocked}>
                    <Button
                      variant="outline"
                      className="flex-grow h-auto min-h-10 justify-start"
                    >
                      {idx.columns.length > 0 ? (
                        <div className="flex gap-1 flex-wrap">
                          {idx.columns.map((colId) => {
                            const col = columnsMap.get(colId);
                            return (
                              <Badge
                                key={colId}
                                variant="secondary"
                                className="flex items-center gap-1"
                              >
                                {col?.name}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const newCols = idx.columns.filter(
                                      (c) => c !== colId
                                    );
                                    handleIndexUpdate(idx.id, {
                                      columns: newCols,
                                    });
                                  }}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          Select columns...
                        </span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-48">
                    <Command>
                      <CommandInput placeholder="Search columns..." />
                      <CommandEmpty>No columns found.</CommandEmpty>
                      <CommandGroup>
                        {columns.map((col) => (
                          <CommandItem
                            key={col.id}
                            onSelect={() => {
                              const newCols = idx.columns.includes(col.id)
                                ? idx.columns.filter((c) => c !== col.id)
                                : [...idx.columns, col.id];
                              handleIndexUpdate(idx.id, { columns: newCols });
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                idx.columns.includes(col.id)
                                  ? "opacity-100"
                                  : "opacity-0"
                              )}
                            />
                            {col.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </Command>
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild disabled={isLocked}>
                    <Button size="icon" variant="ghost">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-64 p-2 space-y-4">
                    <div className="space-y-1">
                      <Label htmlFor={`index-name-${idx.id}`}>Name</Label>
                      <Input
                        id={`index-name-${idx.id}`}
                        value={idx.name}
                        onChange={(e) =>
                          handleIndexUpdate(idx.id, { name: e.target.value })
                        }
                        disabled={isLocked}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`index-type-${idx.id}`}>Type</Label>
                      <Select
                        value={idx.type ?? (idx.isUnique ? "UNIQUE" : "INDEX")}
                        onValueChange={(value) => {
                          const nextType = value as IndexType;
                          handleIndexUpdate(idx.id, {
                            type: nextType,
                            isUnique: nextType === "UNIQUE",
                          });
                        }}
                        disabled={isLocked}
                      >
                        <SelectTrigger id={`index-type-${idx.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(indexTypeLabels) as IndexType[]).map(
                            (indexType) => (
                              <SelectItem key={indexType} value={indexType}>
                                {indexTypeLabels[indexType]}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={`index-unique-${idx.id}`}
                        checked={!!idx.isUnique}
                        onCheckedChange={(checked) => {
                          const isUnique = !!checked;
                          handleIndexUpdate(idx.id, {
                            isUnique,
                            type: isUnique ? "UNIQUE" : "INDEX",
                          });
                        }}
                        disabled={isLocked}
                      />
                      <Label htmlFor={`index-unique-${idx.id}`}>Unique</Label>
                    </div>
                    <Separator />
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-full"
                      onClick={() => handleDeleteIndex(idx.id)}
                      disabled={isLocked}
                    >
                      Delete Index
                    </Button>
                  </PopoverContent>
                </Popover>
              </div>
            ))}
            {indices.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-2">
                No indices defined.
              </p>
            )}
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="comment">
          <AccordionTrigger>Comment</AccordionTrigger>
          <AccordionContent>
            <Textarea
              placeholder="Table comment..."
              value={tableComment}
              onChange={handleCommentChange}
              onBlur={handleCommentSave}
              disabled={isLocked}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <Separator />
      <div>
        <h4 className="font-semibold mb-2">Actions</h4>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="flex-grow"
            onClick={onStartEdit}
            disabled={isLocked}
          >
            <Edit className="h-4 w-4 mr-2" /> Rename
          </Button>
          <ColorPicker
            color={node.data.color || colors.DEFAULT_TABLE_COLOR}
            onColorChange={handleColorChange}
            disabled={isLocked}
          />
          <Button
            variant="destructive"
            className="flex-grow col-span-2"
            onClick={() => onNodeDelete(node.id)}
            disabled={isLocked}
          >
            <Trash2 className="h-4 w-4 mr-2" /> Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
