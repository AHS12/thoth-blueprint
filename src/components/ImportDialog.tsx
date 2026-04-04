import { MSSQLIcon } from "@/components/icons/MSSQLIcon";
import { MySQLIcon } from "@/components/icons/MySQLIcon";
import { PostgreSQLIcon } from "@/components/icons/PostgreSQLIcon";
import { SQLiteIcon } from "@/components/icons/SQLiteIcon";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { importFromJson } from "@/lib/importer";
import { parseDbmlAsync } from "@/lib/importer/dbml-parser";
import { parseMySqlDdlAsync } from "@/lib/importer/mysql-ddl-parser";
import { type DatabaseType, type Diagram } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useStore } from "@/store/store";
import { showError } from "@/utils/toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { Database, FileJson, FileText, Terminal, Upload } from "lucide-react";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useForm } from "react-hook-form";
import * as z from "zod";

const formSchema = z.object({
  name: z.string().trim().min(1, "Diagram name is required"),
  dbType: z.enum(["mysql", "postgres"]),
  importType: z.enum(["json", "sql", "dbml"]),
  content: z.string().min(1, "Content to import is required"),
  reorganizeAfterImport: z.boolean().optional(),
});

interface ImportDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onImportDiagram: (diagramData: { name: string; dbType: DatabaseType; data: Diagram['data'] }) => void;
}

export function ImportDialog({ isOpen, onOpenChange, onImportDiagram }: ImportDialogProps) {
  const [activeTab, setActiveTab] = useState("json");
  const [isParsing, setIsParsing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [uiStep, setUiStep] = useState<1 | 2>(1);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    reValidateMode: "onChange",
    defaultValues: {
      name: "",
      dbType: "mysql",
      importType: "json",
      content: "",
      reorganizeAfterImport: true,
    },
  });

  const content = form.watch("content");
  const nameValue = form.watch("name");

  const handleFileRead = useCallback((file: File) => {
    const acceptedExtension = activeTab === 'json' ? '.json' : activeTab === 'dbml' ? '.dbml' : '.sql';
    if (!file.name.endsWith(acceptedExtension)) {
      showError(`Invalid file type. Please upload a ${acceptedExtension} file.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const fileContent = e.target?.result as string;
      form.setValue("content", fileContent);
    };
    reader.readAsText(file);
  }, [activeTab, form]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      handleFileRead(file);
    }
  }, [handleFileRead]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: activeTab === 'json'
      ? { 'application/json': ['.json'] }
      : activeTab === 'dbml'
        ? { 'text/plain': ['.dbml'] }
        : { 'application/sql': ['.sql'] },
    multiple: false,
  });

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    form.setValue("importType", value as "json" | "sql" | "dbml");
    form.setValue("content", ""); // Clear content on tab switch
    form.clearErrors("content");
  };

  const dbOptions: { key: "mysql" | "postgres"; label: string; component: React.ReactNode }[] = [
    { key: "mysql", label: "MySQL", component: <MySQLIcon className="h-6" /> },
    { key: "postgres", label: "PostgreSQL", component: <PostgreSQLIcon className="h-6" /> },
  ];

  // Coming soon databases — shown in Step 1 only, disabled
  const comingSoonOptions: { key: "mssql" | "sqlite"; label: string; component: React.ReactNode }[] = [
    { key: "mssql", label: "SQL Server", component: <MSSQLIcon className="h-6" /> },
    { key: "sqlite", label: "SQLite", component: <SQLiteIcon className="h-6" /> },
  ];

  const selectDatabase = (key: "mysql" | "postgres") => {
    const name = form.getValues("name").trim();
    if (!name) {
      // Trigger field validation and inform the user
      form.trigger("name");
      showError("Please enter a diagram name to continue.");
      return;
    }
    // Clear any lingering name errors once valid
    form.clearErrors("name");
    form.setValue("dbType", key);
    setActiveTab("json");
    setUiStep(2);
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      // Import path enforces checkpoint compatibility migration by default.
      await useStore.getState().runCheckpointMigration();

      let diagramData: Diagram['data'];
      const dbType = values.dbType as DatabaseType;

      if (values.importType === "json") {
        diagramData = importFromJson(values.content);
      } else if (values.importType === "sql") {
        setIsParsing(true);
        setProgress(0);
        setProgressLabel("Starting import...");

        if (dbType === 'mysql') {
          diagramData = await parseMySqlDdlAsync(values.content, (p, label) => {
            setProgress(p);
            if (label) setProgressLabel(label);
          }, values.reorganizeAfterImport);
        } else if (dbType === 'postgres') {
          // Import PostgreSQL DDL
          const { parsePostgreSqlDdlAsync } = await import('../lib/importer/postgres-ddl-parser');
          diagramData = await parsePostgreSqlDdlAsync(values.content, (p, label) => {
            setProgress(p);
            if (label) setProgressLabel(label);
          }, values.reorganizeAfterImport);
        } else {
          showError(`Sorry, ${dbType} DDL import is not supported at the moment.`);
          setIsParsing(false);
          return;
        }
        setIsParsing(false);
      } else if (values.importType === "dbml") {
        setIsParsing(true);
        setProgress(0);
        setProgressLabel("Starting DBML import...");

        diagramData = await parseDbmlAsync(values.content, (p, label) => {
          setProgress(p);
          if (label) setProgressLabel(label);
        }, values.reorganizeAfterImport);

        setIsParsing(false);
      } else {
        throw new Error("Invalid import type");
      }

      onImportDiagram({ name: values.name, dbType, data: diagramData });
      onOpenChange(false);
      form.reset();
      setActiveTab("json");
      setProgress(0);
      setProgressLabel("");
      setIsParsing(false);
    } catch (error) {
      console.error("Import failed:", error);
      const errorMessage = error instanceof Error ? `Import failed: ${error.message}` : "An unknown error occurred during import.";
      showError(errorMessage);
      setIsParsing(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          w-[calc(100vw-2rem)] sm:w-full
          sm:max-w-2xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl
          max-h-[calc(100vh-2rem)]
        "
      >
        <DialogHeader>
          <DialogTitle>Import Diagram</DialogTitle>
          <DialogDescription>
            Import a diagram from JSON, SQL schema, or DBML file.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            {/* Scrollable content area to keep dialog height-aware */}
            <div className="overflow-y-auto no-scrollbar max-h-[calc(100vh-8rem)] px-3 sm:px-4 md:px-6 space-y-4">
              {uiStep === 1 && (
                <div className="space-y-3 px-3 sm:px-4 md:px-6 pb-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">Step 1 — Diagram details</h3>
                    <span className="text-xs text-muted-foreground">Name and database</span>
                  </div>
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Diagram Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., My Imported Schema" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="space-y-2">
                    <FormLabel>Database</FormLabel>
                    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3">
                      {dbOptions.map((db) => {
                        const selected = form.getValues("dbType") === db.key;
                        const isNameProvided = !!nameValue?.trim();
                        return (
                          <Card
                            key={db.key}
                            role="button"
                            aria-selected={selected}
                            aria-disabled={!isNameProvided}
                            onClick={() => {
                              if (!isNameProvided) {
                                form.trigger("name");
                                showError("Please enter a diagram name to continue.");
                                return;
                              }
                              selectDatabase(db.key);
                            }}
                            className={cn(
                              "transition border",
                              isNameProvided ? "cursor-pointer" : "cursor-not-allowed opacity-60",
                              selected ? "border-primary ring-1 ring-primary" : "hover:border-primary/40"
                            )}
                          >
                            <CardHeader className="flex items-center gap-3 py-3">
                              {db.component}
                              <div>
                                <CardTitle className="text-base">{db.label}</CardTitle>
                                <CardDescription className="text-xs">
                                  {isNameProvided ? "Click to select" : "Enter name to enable"}
                                </CardDescription>
                              </div>
                            </CardHeader>
                          </Card>
                        );
                      })}
                      {comingSoonOptions.map((db) => (
                        <Card
                          key={db.key}
                          aria-disabled="true"
                          className={cn(
                            "opacity-60 cursor-not-allowed border border-dashed bg-muted/30",
                            "hover:border-muted"
                          )}
                          title="Coming soon"
                        >
                          <CardHeader className="flex items-center gap-3 py-3">
                            {db.component}
                            <div>
                              <CardTitle className="text-base">{db.label}</CardTitle>
                              <CardDescription className="text-xs">Coming soon</CardDescription>
                            </div>
                          </CardHeader>
                        </Card>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {uiStep === 2 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">Step 2 — Import source</h3>
                    <span className="text-xs text-muted-foreground">JSON, SQL DDL, or DBML</span>
                  </div>
                  {/* Summary of selections from Step 1 */}
                  <div className="flex items-center justify-between rounded-md border p-3 bg-muted/30">
                    <div className="flex items-center gap-3">
                      {form.getValues("dbType") === "mysql" ? (
                        <MySQLIcon className="h-5" />
                      ) : (
                        <PostgreSQLIcon className="h-5" />
                      )}
                      <div className="text-sm">
                        <div className="font-medium">{form.getValues("name") || "Untitled diagram"}</div>
                        <div className="text-muted-foreground">
                          Database: {form.getValues("dbType") === "mysql" ? "MySQL" : "PostgreSQL"}
                        </div>
                      </div>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => setUiStep(1)}>
                      Change
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Card
                      role="button"
                      aria-selected={activeTab === "json"}
                      onClick={() => handleTabChange("json")}
                      className={cn(
                        "cursor-pointer transition border",
                        activeTab === "json" ? "border-primary ring-1 ring-primary" : "hover:border-primary/40"
                      )}
                    >
                      <CardHeader className="flex items-center gap-3 py-3">
                        <FileJson className="h-5 w-5" />
                        <div>
                          <CardTitle className="text-base">From JSON</CardTitle>
                          <CardDescription className="text-xs">Exported app JSON</CardDescription>
                        </div>
                      </CardHeader>
                    </Card>
                    <Card
                      role="button"
                      aria-selected={activeTab === "sql"}
                      onClick={() => handleTabChange("sql")}
                      className={cn(
                        "cursor-pointer transition border",
                        activeTab === "sql" ? "border-primary ring-1 ring-primary" : "hover:border-primary/40"
                      )}
                    >
                      <CardHeader className="flex items-center gap-3 py-3">
                        <FileText className="h-5 w-5" />
                        <div>
                          <CardTitle className="text-base">From SQL (DDL)</CardTitle>
                          <CardDescription className="text-xs">{form.getValues("dbType") === "mysql" ? "MySQL CREATE TABLE" : "PostgreSQL CREATE TABLE"}</CardDescription>
                        </div>
                      </CardHeader>
                    </Card>
                    <Card
                      role="button"
                      aria-selected={activeTab === "dbml"}
                      onClick={() => handleTabChange("dbml")}
                      className={cn(
                        "cursor-pointer transition border",
                        activeTab === "dbml" ? "border-primary ring-1 ring-primary" : "hover:border-primary/40"
                      )}
                    >
                      <CardHeader className="flex items-center gap-3 py-3">
                        <Database className="h-5 w-5" />
                        <div>
                          <CardTitle className="text-base">From DBML</CardTitle>
                          <CardDescription className="text-xs">Database Markup Language</CardDescription>
                        </div>
                      </CardHeader>
                    </Card>
                  </div>
                </div>
              )}

              {uiStep === 2 && (
                <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                  <TabsContent value="json" className="mt-4">
                    <p className="text-sm text-muted-foreground mb-2">
                      Import a diagram from a JSON file previously exported from this application.
                    </p>
                  </TabsContent>
                  <TabsContent value="sql" className="mt-4 space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Import a diagram from a {form.getValues("dbType") === "mysql" ? "MySQL" : "PostgreSQL"} `CREATE TABLE` script.
                    </p>
                    <Alert className="p-3 sm:p-4">
                      <Terminal className="h-4 w-4" />
                      <AlertTitle className="text-sm sm:text-base">How to get your {form.getValues("dbType") === "mysql" ? "MySQL" : "PostgreSQL"} schema</AlertTitle>
                      <AlertDescription className="space-y-2 text-xs sm:text-sm">
                        {form.getValues("dbType") === "mysql" ? (
                          <>
                            <p className="text-xs sm:text-sm">
                              You can generate a schema file from your database using the `mysqldump` command.
                              Run the following command in your terminal:
                            </p>
                            <pre className="mt-2 p-2 bg-muted rounded-md text-[11px] sm:text-xs font-mono w-full max-w-full whitespace-pre-wrap break-words">
                              <code>
                                mysqldump --no-data -u [username] -p [database_name] &gt; schema.sql
                              </code>
                            </pre>
                            <p className="text-xs sm:text-sm">
                              Replace `[username]` and `[database_name]` with your database credentials.
                              The `--no-data` flag ensures only the table structure is exported.
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-xs sm:text-sm">
                              You can generate a schema file from your PostgreSQL database using the `pg_dump` command.
                              Run the following command in your terminal:
                            </p>
                            <pre className="mt-2 p-2 bg-muted rounded-md text-[11px] sm:text-xs font-mono w-full max-w-full whitespace-pre-wrap break-words">
                              <code>
                                pg_dump -U [username] -s [database_name] &gt; schema.sql
                              </code>
                            </pre>
                            <p className="text-xs sm:text-sm">
                              Replace `[username]` and `[database_name]` with your database credentials.
                              The `-s` flag ensures only the schema (table structure) is exported.
                            </p>
                          </>
                        )}
                      </AlertDescription>
                    </Alert>
                    <FormField
                      control={form.control}
                      name="reorganizeAfterImport"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value ?? false}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>
                              Auto-organize tables by relationships
                            </FormLabel>
                            <p className="text-sm text-muted-foreground">
                              Automatically arrange tables based on their foreign key relationships for better visualization
                            </p>
                          </div>
                        </FormItem>
                      )}
                    />
                    {isParsing && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Importing SQL…</span>
                          <span>{progressLabel}</span>
                        </div>
                        <Progress value={progress} />
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="dbml" className="mt-4 space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Import a diagram from a DBML script.
                    </p>
                    <FormField
                      control={form.control}
                      name="reorganizeAfterImport"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value ?? false}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>
                              Auto-organize tables by relationships
                            </FormLabel>
                            <p className="text-sm text-muted-foreground">
                              Automatically arrange tables based on their foreign key relationships
                            </p>
                          </div>
                        </FormItem>
                      )}
                    />
                    {isParsing && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Importing DBML…</span>
                          <span>{progressLabel}</span>
                        </div>
                        <Progress value={progress} />
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              )}

              {uiStep === 2 && (
                <FormField
                  control={form.control}
                  name="content"
                  render={({ field }) => (
                    <FormItem>
                      {content ? (
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <FormLabel>
                              {activeTab === 'json' ? 'JSON Content' : activeTab === 'dbml' ? 'DBML Content' : 'SQL Content'}
                            </FormLabel>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => form.setValue("content", "")}
                            >
                              Clear and re-upload
                            </Button>
                          </div>
                          <FormControl>
                            <Textarea
                              placeholder={`Paste content, upload a file, or drag and drop here...`}
                              className="min-h-[200px] font-mono"
                              {...field}
                            />
                          </FormControl>
                        </div>
                      ) : (
                        <div
                          {...getRootProps({
                            className: cn(
                              "relative border-2 border-dashed rounded-lg p-4 transition-colors h-[240px] flex flex-col items-center justify-center text-center cursor-pointer",
                              isDragActive ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
                            )
                          })}
                        >
                          <input {...getInputProps()} />
                          <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                          {isDragActive ? (
                            <p className="text-lg font-semibold text-primary">Drop the file here...</p>
                          ) : (
                            <>
                              <p className="text-muted-foreground mb-2">
                                Drag & drop a file here, or click to select a file
                              </p>
                              <p className="text-xs text-muted-foreground">
                                (Only {activeTab === 'json' ? '*.json' : activeTab === 'dbml' ? '*.dbml' : '*.sql'} files will be accepted)
                              </p>
                            </>
                          )}
                        </div>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
            <DialogFooter className="mt-3 sm:mt-4">
              {uiStep === 1 ? (
                <Button
                  type="button"
                  disabled={!nameValue?.trim()}
                  onClick={() => {
                    const name = form.getValues("name").trim();
                    if (!name) {
                      form.trigger("name");
                      showError("Please enter a diagram name to continue.");
                      return;
                    }
                    setUiStep(2);
                  }}
                >
                  Next
                </Button>
              ) : (
                <div className="flex w-full gap-2">
                  <Button type="button" variant="outline" onClick={() => setUiStep(1)}>
                    Back
                  </Button>
                  <Button type="submit" disabled={isParsing || !content} className="flex-1">
                    {isParsing ? "Importing…" : "Import Diagram"}
                  </Button>
                </div>
              )}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}