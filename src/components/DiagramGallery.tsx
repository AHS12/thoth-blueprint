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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { TableBody, TableCell, TableHead, TableHeader, TableRow, Table as UiTable } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePWA } from "@/hooks/usePWA";
import { exportDbToJson } from "@/lib/backup";
import { colors } from "@/lib/constants";
import { dbTypeDisplay } from "@/lib/db-types";
import { type DatabaseType, type Diagram } from "@/lib/types";
import { useStore, type StoreState } from "@/store/store";
import { formatDistanceToNow } from "date-fns";
import { Copy, GitCommitHorizontal, Grid, Import, List, Pencil, PlusCircle, RotateCcw, Save, Settings, Table, Trash2, Upload } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { AppIntro } from "./AppIntro";
import { CreateDiagramDialog } from "./CreateDiagramDialog";
import { Features } from "./Features";
import { ImportDialog } from "./ImportDialog";
import { LoadProjectDialog } from "./LoadProjectDialog";
import { RenameDiagramDialog } from "./RenameDiagramDialog";
import { DatabaseTypeIcon } from "./icons/DatabaseTypeIcon";

interface DiagramGalleryProps {
  onInstallAppRequest: () => void;
  onCheckForUpdate: () => void;
  onViewAbout: () => void;
  onViewWhatsNew: () => void;
  onViewHelpCenter: () => void;
}

export default function DiagramGallery({ onInstallAppRequest, onCheckForUpdate, onViewAbout, onViewWhatsNew, onViewHelpCenter }: DiagramGalleryProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isLoadProjectDialogOpen, setIsLoadProjectDialogOpen] = useState(false);
  const [diagramToEdit, setDiagramToEdit] = useState<Diagram | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortType, setSortType] = useState<"name" | "modified">("modified");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;
  const isMobile = useIsMobile();

  // Force grid view when on mobile
  useEffect(() => {
    if (isMobile) {
      setViewMode("grid");
    }
  }, [isMobile]);

  const {
    setSelectedDiagramId,
    createDiagram,
    importDiagram,
    renameDiagram,
    duplicateDiagram,
    moveDiagramToTrash,
    restoreDiagram,
    permanentlyDeleteDiagram,
  } = useStore(
    useShallow((state: StoreState) => ({
      setSelectedDiagramId: state.setSelectedDiagramId,
      createDiagram: state.createDiagram,
      importDiagram: state.importDiagram,
      renameDiagram: state.renameDiagram,
      duplicateDiagram: state.duplicateDiagram,
      moveDiagramToTrash: state.moveDiagramToTrash,
      restoreDiagram: state.restoreDiagram,
      permanentlyDeleteDiagram: state.permanentlyDeleteDiagram,
    }))
  );

  const diagrams = useStore((state) => state.diagrams);

  const { setTheme } = useTheme();
  const { isInstalled } = usePWA();

  const activeDiagrams = diagrams?.filter(d => !d.deletedAt);
  const trashedDiagrams = diagrams?.filter(d => d.deletedAt);

  // Filter and sort active diagrams
  const filteredAndSortedDiagrams = useMemo(() => {
    if (!activeDiagrams) return [];

    const filtered = activeDiagrams.filter(diagram =>
      diagram.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return filtered.sort((a, b) => {
      if (sortType === "name") {
        const nameA = a.name.toLowerCase();
        const nameB = b.name.toLowerCase();

        if (sortOrder === "asc") {
          return nameA.localeCompare(nameB);
        } else {
          return nameB.localeCompare(nameA);
        }
      } else {
        // Sort by last modified (updatedAt)
        const dateA = new Date(a.updatedAt).getTime();
        const dateB = new Date(b.updatedAt).getTime();

        if (sortOrder === "asc") {
          return dateA - dateB; // Oldest first
        } else {
          return dateB - dateA; // Newest first
        }
      }
    });
  }, [activeDiagrams, searchTerm, sortType, sortOrder]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredAndSortedDiagrams.length / PAGE_SIZE));
  }, [filteredAndSortedDiagrams]);

  const paginatedDiagrams = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredAndSortedDiagrams.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredAndSortedDiagrams, currentPage]);

  useEffect(() => {
    // Reset to first page when search or sort changes
    setCurrentPage(1);
  }, [searchTerm, sortType, sortOrder]);

  useEffect(() => {
    // Clamp current page when totalPages shrinks
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);
  const activeDiagramNames = activeDiagrams.map(d => d.name);

  const handleCreateDiagram = async ({ name, dbType }: { name: string; dbType: DatabaseType }) => {
    await createDiagram({
      name,
      dbType,
      data: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, isLocked: false },
    });
  };

  const handleImportDiagram = async (diagramData: { name: string; dbType: DatabaseType; data: Diagram['data'] }) => {
    await importDiagram({
      ...diagramData,
      data: { ...diagramData.data, isLocked: diagramData.data.isLocked ?? false }
    });
  };

  const openRenameDialog = (diagram: Diagram) => {
    setDiagramToEdit(diagram);
    setIsRenameDialogOpen(true);
  };

  // dbTypeDisplay moved to shared icon component

  return (
    <div className="p-4 md:p-8 h-full w-full bg-background overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        <div data-tour="gallery-intro">
          <AppIntro />
        </div>

        <div className="my-6 md:my-8">
          <Features />
        </div>

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 mt-8 md:mt-12">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">My Diagrams</h1>
          <div className="flex gap-2 items-center self-end md:self-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" data-tour="gallery-settings">
                  <Settings className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Theme</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={() => setTheme("light")}>Light</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme("dark")}>Dark</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme("system")}>System</DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onCheckForUpdate}>Check for Updates</DropdownMenuItem>
                {!isInstalled && (
                  <DropdownMenuItem onClick={onInstallAppRequest}>Install App</DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onViewHelpCenter}>Help Center</DropdownMenuItem>
                <DropdownMenuItem onClick={onViewAbout}>About</DropdownMenuItem>
                <DropdownMenuItem onClick={onViewWhatsNew}>What's New</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" onClick={() => setIsLoadProjectDialogOpen(true)}>
              <Upload className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Load Save</span>
            </Button>
            <Button variant="outline" onClick={exportDbToJson}>
              <Save className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Save Data</span>
            </Button>
            <Button variant="outline" onClick={() => setIsImportDialogOpen(true)} data-tour="gallery-import">
              <Import className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Import Diagram</span>
            </Button>
            <Button onClick={() => setIsCreateDialogOpen(true)} data-tour="gallery-create">
              <PlusCircle className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Create New</span>
            </Button>
          </div>
        </div>

        <Tabs defaultValue="diagrams" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="diagrams">Diagrams</TabsTrigger>
            <TabsTrigger value="trash">Trash</TabsTrigger>
          </TabsList>
          <TabsContent value="diagrams" className="mt-6">
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="flex-1">
                <Input
                  placeholder="Search diagrams..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="max-w-sm"
                />
              </div>
              <div className="flex gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      Sort: {sortType === "name"
                        ? (sortOrder === "asc" ? "A-Z" : "Z-A")
                        : (sortOrder === "desc" ? "Newest" : "Oldest")}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => { setSortType("name"); setSortOrder("asc"); }}>
                      Name (A-Z)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setSortType("name"); setSortOrder("desc"); }}>
                      Name (Z-A)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setSortType("modified"); setSortOrder("desc"); }}>
                      Last Modified (Newest First)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setSortType("modified"); setSortOrder("asc"); }}>
                      Last Modified (Oldest First)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="hidden sm:flex gap-2">
                  <ToggleGroup type="single" value={viewMode} onValueChange={(value) => value && setViewMode(value as "grid" | "list")}>
                    <ToggleGroupItem value="grid" aria-label="Grid view">
                      <Grid className="h-4 w-4" />
                    </ToggleGroupItem>
                    <ToggleGroupItem value="list" aria-label="List view">
                      <List className="h-4 w-4" />
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </div>
            </div>
            {filteredAndSortedDiagrams.length > 0 ? (
              viewMode === "grid" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {paginatedDiagrams.map((diagram) => (
                    <div key={diagram.id} className="relative group">
                      <Card
                        className="hover:shadow-lg hover:border-primary transition-all cursor-pointer flex flex-col h-full overflow-hidden"
                        onClick={() => setSelectedDiagramId(diagram.id!)}
                      >
                        <div style={{ backgroundColor: diagram.data.nodes?.[0]?.data.color || colors.DEFAULT_DIAGRAM_COLOR }} className="h-2 w-full" />
                        <CardHeader>
                          <CardTitle className="truncate">{diagram.name}</CardTitle>
                          <CardDescription className="flex items-center gap-2 pt-1">
                            <DatabaseTypeIcon dbType={diagram.dbType} className="h-4 w-auto" />
                            {dbTypeDisplay[diagram.dbType]}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="flex-grow space-y-3 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Table className="h-4 w-4" />
                            <span>{diagram.data.nodes?.filter(n => !n.data.isDeleted).length || 0} Tables</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <GitCommitHorizontal className="h-4 w-4" />
                            <span>{diagram.data.edges?.length || 0} Relationships</span>
                          </div>
                        </CardContent>
                        <CardFooter>
                          <p className="text-xs text-muted-foreground">
                            Updated {formatDistanceToNow(new Date(diagram.updatedAt), { addSuffix: true })}
                          </p>
                        </CardFooter>
                      </Card>
                      <div className="absolute top-4 right-2 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={(e) => {
                          e.stopPropagation();
                          duplicateDiagram(diagram.id!);
                        }}>
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => openRenameDialog(diagram)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="icon" className="h-8 w-8">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Move to Trash?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will move the "{diagram.name}" diagram to the trash. You can restore it later.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => moveDiagramToTrash(diagram.id!)}>Move to Trash</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Card>
                  <UiTable>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Database Type</TableHead>
                        <TableHead>Tables</TableHead>
                        <TableHead>Relationships</TableHead>
                        <TableHead>Last Updated</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedDiagrams.map((diagram) => (
                        <TableRow key={diagram.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedDiagramId(diagram.id!)}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: diagram.data.nodes?.[0]?.data.color || colors.DEFAULT_DIAGRAM_COLOR }}
                              />
                              {diagram.name}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <DatabaseTypeIcon dbType={diagram.dbType} className="h-4 w-auto" />
                              {dbTypeDisplay[diagram.dbType]}
                            </div>
                          </TableCell>
                          <TableCell>{diagram.data.nodes?.filter(n => !n.data.isDeleted).length || 0}</TableCell>
                          <TableCell>{diagram.data.edges?.length || 0}</TableCell>
                          <TableCell>{formatDistanceToNow(new Date(diagram.updatedAt), { addSuffix: true })}</TableCell>
                          <TableCell className="text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => {
                              e.stopPropagation();
                              duplicateDiagram(diagram.id!);
                            }}>
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openRenameDialog(diagram)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="icon" className="h-8 w-8">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Move to Trash?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will move the "{diagram.name}" diagram to the trash. You can restore it later.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => moveDiagramToTrash(diagram.id!)}>Move to Trash</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </UiTable>
                </Card>
              )
            ) : (
              <div className="text-center py-24 border-2 border-dashed rounded-lg">
                <h2 className="text-xl font-semibold">
                  {searchTerm ? "No diagrams found" : "No diagrams yet"}
                </h2>
                <p className="text-muted-foreground mt-2 mb-4">
                  {searchTerm ? "Try adjusting your search term" : "Click 'Create New' to get started."}
                </p>
              </div>
            )
            }

            {filteredAndSortedDiagrams.length > 0 && totalPages > 1 && (
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="w-full sm:w-auto"
                  aria-label="Previous page"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="w-full sm:w-auto"
                  aria-label="Next page"
                >
                  Next
                </Button>
              </div>
            )}
          </TabsContent>
          <TabsContent value="trash" className="mt-6">
            {trashedDiagrams && trashedDiagrams.length > 0 ? (
              <Card>
                <UiTable>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Deleted At</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trashedDiagrams.map((diagram) => (
                      <TableRow key={diagram.id}>
                        <TableCell className="font-medium">{diagram.name}</TableCell>
                        <TableCell>{formatDistanceToNow(new Date(diagram.deletedAt!), { addSuffix: true })}</TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button variant="ghost" size="sm" onClick={() => restoreDiagram(diagram.id!)}>
                            <RotateCcw className="h-4 w-4 mr-2" /> Restore
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="destructive" size="sm">
                                <Trash2 className="h-4 w-4 mr-2" /> Delete Permanently
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This action cannot be undone. This will permanently delete the "{diagram.name}" diagram and all of its data.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => permanentlyDeleteDiagram(diagram.id!)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </UiTable>
              </Card>
            ) : (
              <div className="text-center py-24 border-2 border-dashed rounded-lg">
                <h2 className="text-xl font-semibold">Trash is empty</h2>
                <p className="text-muted-foreground mt-2">Deleted diagrams will appear here.</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <CreateDiagramDialog
        isOpen={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onCreateDiagram={handleCreateDiagram}
        existingDiagramNames={activeDiagramNames}
      />
      <ImportDialog
        isOpen={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
        onImportDiagram={handleImportDiagram}
      />
      <RenameDiagramDialog
        isOpen={isRenameDialogOpen}
        onOpenChange={setIsRenameDialogOpen}
        onRenameDiagram={renameDiagram}
        diagram={diagramToEdit}
        existingDiagramNames={activeDiagramNames}
      />
      <LoadProjectDialog
        isOpen={isLoadProjectDialogOpen}
        onOpenChange={setIsLoadProjectDialogOpen}
      />
    </div>
  );
}