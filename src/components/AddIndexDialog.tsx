import { type AppNode, type Index, type IndexType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export interface NewIndex {
  tableId: string;
  name: string;
  columns: string[];
  type: IndexType;
}

interface AddIndexDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodes: AppNode[];
  onCreateIndex: (index: NewIndex) => void;
  indexToEdit?: {
    tableId: string;
    index: Index;
  } | null;
  onUpdateIndex?: (index: NewIndex, originalIndex: Index) => void;
}

const indexTypeLabels: Record<IndexType, string> = {
  INDEX: "Default",
  UNIQUE: "Unique",
  FULLTEXT: "Fulltext",
  SPATIAL: "Spatial",
};

export default function AddIndexDialog({
  open,
  onOpenChange,
  nodes,
  onCreateIndex,
  indexToEdit,
  onUpdateIndex,
}: AddIndexDialogProps) {
  const firstTableId = nodes[0]?.id ?? "";
  const firstTableName = nodes[0]?.data.label ?? "";
  const editingIndexId = indexToEdit?.index.id ?? null;
  const editingTableId = indexToEdit?.tableId ?? firstTableId;
  const editingIndex = indexToEdit?.index ?? null;
  const [tableId, setTableId] = useState(firstTableId);
  const [name, setName] = useState("");
  const [columns, setColumns] = useState<string[]>([]);
  const [type, setType] = useState<IndexType>("INDEX");
  const [error, setError] = useState<string | null>(null);

  const selectedTable = useMemo(
    () => nodes.find((node) => node.id === tableId),
    [nodes, tableId],
  );

  const selectedTableColumns = selectedTable?.data.columns ?? [];

  useEffect(() => {
    if (!open) return;

    setTableId(editingTableId);
    setName(
      editingIndex?.name ?? (firstTableName ? `${firstTableName}_index` : ""),
    );
    setColumns(editingIndex?.columns ?? []);
    setType(
      editingIndex?.type ?? (editingIndex?.isUnique ? "UNIQUE" : "INDEX"),
    );
    setError(null);
  }, [editingIndex, editingIndexId, editingTableId, firstTableId, firstTableName, open]);

  const handleTableChange = (nextTableId: string) => {
    const nextTable = nodes.find((node) => node.id === nextTableId);
    setTableId(nextTableId);
    setColumns([]);
    setName(nextTable ? `${nextTable.data.label}_index` : "");
    setError(null);
  };

  const toggleColumn = (columnId: string) => {
    setColumns((current) =>
      current.includes(columnId)
        ? current.filter((id) => id !== columnId)
        : [...current, columnId],
    );
    setError(null);
  };

  const moveColumn = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= columns.length) return;

    setColumns((current) => {
      const reordered = [...current];
      const currentColumn = reordered[index];
      const nextColumn = reordered[nextIndex];
      if (!currentColumn || !nextColumn) return current;
      [reordered[index], reordered[nextIndex]] = [
        nextColumn,
        currentColumn,
      ];
      return reordered;
    });
  };

  const handleSubmit = () => {
    const trimmedName = name.trim();

    if (!selectedTable) {
      setError("Select a table.");
      return;
    }

    if (!trimmedName) {
      setError("Index name is required.");
      return;
    }

    if (columns.length === 0) {
      setError("Select at least one column.");
      return;
    }

    const duplicateName = (selectedTable.data.indices ?? []).some(
      (index) =>
        index.id !== editingIndexId &&
        index.name.trim().toLowerCase() === trimmedName.toLowerCase(),
    );
    if (duplicateName) {
      setError("An index with this name already exists on this table.");
      return;
    }

    const submittedIndex = {
      tableId: selectedTable.id,
      name: trimmedName,
      columns,
      type,
    };

    if (editingIndex && onUpdateIndex) {
      onUpdateIndex(submittedIndex, editingIndex);
    } else {
      onCreateIndex(submittedIndex);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingIndex ? "Edit Index" : "Add Index"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="index-table">Table</Label>
            <Select
              value={tableId}
              onValueChange={handleTableChange}
              disabled={!!editingIndex}
            >
              <SelectTrigger id="index-table">
                <SelectValue placeholder="Select a table" />
              </SelectTrigger>
              <SelectContent>
                {nodes.map((node) => (
                  <SelectItem key={node.id} value={node.id}>
                    {node.data.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="index-name">Index name</Label>
            <Input
              id="index-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              placeholder="e.g., deployments_project_idx"
            />
          </div>

          <div className="space-y-2">
            <Label>Columns</Label>
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border p-2">
              {selectedTableColumns.length > 0 ? (
                selectedTableColumns.map((column) => {
                  const selectedIndex = columns.indexOf(column.id);
                  const isSelected = selectedIndex >= 0;

                  return (
                    <div
                      key={column.id}
                      className="flex items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-muted"
                    >
                      <Checkbox
                        id={`index-column-${column.id}`}
                        checked={isSelected}
                        onCheckedChange={() => toggleColumn(column.id)}
                      />
                      <Label
                        htmlFor={`index-column-${column.id}`}
                        className="flex-1 cursor-pointer font-normal"
                      >
                        {column.name}
                      </Label>
                      {isSelected && (
                        <div className="flex items-center gap-1">
                          <span className="w-5 text-center text-xs text-muted-foreground">
                            {selectedIndex + 1}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => moveColumn(selectedIndex, -1)}
                            disabled={selectedIndex === 0}
                            aria-label={`Move ${column.name} up`}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => moveColumn(selectedIndex, 1)}
                            disabled={selectedIndex === columns.length - 1}
                            aria-label={`Move ${column.name} down`}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <p className="px-2 py-3 text-sm text-muted-foreground">
                  The selected table has no columns.
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Column order is significant for composite indexes.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="index-type">Index type</Label>
            <Select
              value={type}
              onValueChange={(value) => setType(value as IndexType)}
            >
              <SelectTrigger id="index-type">
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

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={nodes.length === 0}>
            {editingIndex ? "Save Changes" : "Create Index"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
