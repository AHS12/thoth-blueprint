import AddIndexDialog, { type NewIndex } from "@/components/AddIndexDialog";
import { type AppNode, type Index, type IndexType } from "@/lib/types";
import { useStore, type StoreState } from "@/store/store";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Database,
  KeyRound,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";

interface IndexesTabProps {
  nodes: AppNode[];
  isLocked: boolean;
  onFocusIndex: (tableId: string, indexId?: string) => void;
}

type BrowserEntry =
  | {
      key: string;
      kind: "index";
      table: AppNode;
      index: Index;
      columns: string[];
    }
  | {
      key: string;
      kind: "primary";
      table: AppNode;
      columns: string[];
    };

const indexTypeLabels: Record<IndexType, string> = {
  INDEX: "INDEX",
  UNIQUE: "UNIQUE",
  FULLTEXT: "FULLTEXT",
  SPATIAL: "SPATIAL",
};

function getIndexType(index: Index): IndexType {
  return index.type ?? (index.isUnique ? "UNIQUE" : "INDEX");
}

export default function IndexesTab({
  nodes,
  isLocked,
  onFocusIndex,
}: IndexesTabProps) {
  const { updateNode } = useStore(
    useShallow((state: StoreState) => ({
      updateNode: state.updateNode,
    })),
  );
  const [filter, setFilter] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [indexToEdit, setIndexToEdit] = useState<{
    tableId: string;
    index: Index;
  } | null>(null);
  const [indexToDelete, setIndexToDelete] = useState<{
    table: AppNode;
    index: Index;
  } | null>(null);

  const entries = useMemo<BrowserEntry[]>(
    () =>
      nodes.flatMap((table) => {
        const columnNames = new Map(
          (table.data.columns ?? []).map((column) => [column.id, column.name]),
        );
        const primaryColumns = (table.data.columns ?? [])
          .filter((column) => column.pk)
          .map((column) => column.name);

        const primaryEntry: BrowserEntry[] =
          primaryColumns.length > 0
            ? [
                {
                  key: `primary-${table.id}`,
                  kind: "primary",
                  table,
                  columns: primaryColumns,
                },
              ]
            : [];

        const indexEntries: BrowserEntry[] = (table.data.indices ?? []).map(
          (index) => ({
            key: `index-${table.id}-${index.id}`,
            kind: "index",
            table,
            index,
            columns: index.columns.map(
              (columnId) => columnNames.get(columnId) ?? columnId,
            ),
          }),
        );

        return [...primaryEntry, ...indexEntries];
      }),
    [nodes],
  );

  const filteredEntries = useMemo(() => {
    const normalizedFilter = filter.trim().toLowerCase();
    if (!normalizedFilter) return entries;

    return entries.filter((entry) => {
      const name = entry.kind === "primary" ? "primary key" : entry.index.name;
      const type = entry.kind === "primary" ? "primary" : getIndexType(entry.index);
      const searchableText = [
        name,
        entry.table.data.label,
        type,
        ...entry.columns,
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedFilter);
    });
  }, [entries, filter]);

  const groupedEntries = useMemo(() => {
    const grouped = new Map<string, BrowserEntry[]>();
    filteredEntries.forEach((entry) => {
      const current = grouped.get(entry.table.id) ?? [];
      current.push(entry);
      grouped.set(entry.table.id, current);
    });
    return nodes
      .map((table) => ({ table, entries: grouped.get(table.id) ?? [] }))
      .filter((group) => group.entries.length > 0);
  }, [filteredEntries, nodes]);

  const handleCreateIndex = ({ tableId, name, columns, type }: NewIndex) => {
    const table = nodes.find((node) => node.id === tableId);
    if (!table) return;

    const newIndex: Index = {
      id: `idx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      columns,
      type,
      isUnique: type === "UNIQUE",
    };

    updateNode({
      ...table,
      data: {
        ...table.data,
        indices: [...(table.data.indices ?? []), newIndex],
      },
    });
  };

  const handleDeleteIndex = () => {
    if (!indexToDelete) return;

    const { table, index } = indexToDelete;
    updateNode({
      ...table,
      data: {
        ...table.data,
        indices: (table.data.indices ?? []).filter(
          (candidate) => candidate.id !== index.id,
        ),
      },
    });
    setIndexToDelete(null);
  };

  const handleUpdateIndex = (
    updatedIndex: NewIndex,
    originalIndex: Index,
  ) => {
    const table = nodes.find((node) => node.id === updatedIndex.tableId);
    if (!table) return;

    updateNode({
      ...table,
      data: {
        ...table.data,
        indices: (table.data.indices ?? []).map((index) =>
          index.id === originalIndex.id
            ? {
                ...index,
                name: updatedIndex.name,
                columns: updatedIndex.columns,
                type: updatedIndex.type,
                isUnique: updatedIndex.type === "UNIQUE",
              }
            : index,
        ),
      },
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-shrink-0 gap-2 px-4 pb-2 pt-1">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search indexes..."
            className="pr-8 pl-9"
            aria-label="Search indexes"
          />
          {filter && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2"
              onClick={() => setFilter("")}
              aria-label="Clear index search"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <Button
          size="sm"
          className="shrink-0"
          onClick={() => setIsAddDialogOpen(true)}
          disabled={isLocked || nodes.length === 0}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden px-4">
        <ScrollArea className="h-full">
          <div className="space-y-5 pb-4">
            {groupedEntries.length > 0 ? (
              groupedEntries.map(({ table, entries: tableEntries }) => (
                <section key={table.id}>
                  <div className="mb-1 flex items-center gap-2 px-1">
                    <Database className="h-3.5 w-3.5 text-muted-foreground" />
                    <h3 className="truncate text-sm font-semibold">
                      {table.data.label}
                    </h3>
                  </div>
                  <div className="space-y-1">
                    {tableEntries.map((entry) => {
                      const isPrimary = entry.kind === "primary";
                      const name = isPrimary
                        ? entry.columns.length > 1
                          ? "COMPOSITE PRIMARY KEY"
                          : "PRIMARY KEY"
                        : entry.index.name || "Unnamed index";
                      const type = isPrimary
                        ? entry.columns.length > 1
                          ? "COMPOSITE"
                          : "PRIMARY"
                        : indexTypeLabels[getIndexType(entry.index)];

                      return (
                        <div
                          key={entry.key}
                          className="flex items-center gap-1 rounded-md border bg-background p-1"
                        >
                          <div className="flex min-w-0 flex-1 items-center px-2 py-1.5 text-left">
                            {isPrimary ? (
                              <KeyRound className="mr-2 h-4 w-4 shrink-0 text-yellow-500" />
                            ) : (
                              <span className="mr-2 h-2 w-2 shrink-0 rounded-full bg-muted-foreground" />
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="truncate text-sm font-medium">
                                  {name}
                                </span>
                                {!isPrimary && entry.index.isUnique && (
                                  <Badge
                                    variant="outline"
                                    className="shrink-0 px-1.5 py-0 text-[10px]"
                                  >
                                    UNIQUE
                                  </Badge>
                                )}
                              </span>
                              <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                                <span className="truncate">
                                  {entry.columns.length > 0
                                    ? entry.columns.join(", ")
                                    : "No columns"}
                                </span>
                                <span className="shrink-0">{type}</span>
                              </span>
                            </span>
                          </div>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                aria-label={`Actions for ${name}`}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {!isPrimary && (
                                <DropdownMenuItem
                                  onSelect={() =>
                                    setIndexToEdit({
                                      tableId: table.id,
                                      index: entry.index,
                                    })
                                  }
                                >
                                  Edit
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onSelect={() => onFocusIndex(table.id)}
                              >
                                Focus table
                              </DropdownMenuItem>
                              {!isPrimary && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    disabled={isLocked}
                                    className="text-destructive focus:text-destructive"
                                    onSelect={() =>
                                      setIndexToDelete({
                                        table,
                                        index: entry.index,
                                      })
                                    }
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))
            ) : (
              <div className="py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  {filter
                    ? "No indexes found matching your search."
                    : "No indexes or primary keys in this diagram yet."}
                </p>
                {filter && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => setFilter("")}
                  >
                    Clear Search
                  </Button>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <AddIndexDialog
        open={isAddDialogOpen || !!indexToEdit}
        onOpenChange={(open) => {
          if (!open) {
            setIsAddDialogOpen(false);
            setIndexToEdit(null);
          }
        }}
        nodes={nodes}
        onCreateIndex={handleCreateIndex}
        indexToEdit={indexToEdit}
        onUpdateIndex={handleUpdateIndex}
      />

      <AlertDialog
        open={!!indexToDelete}
        onOpenChange={(open) => !open && setIndexToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete index?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the index from the table. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteIndex}
            >
              Delete index
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
