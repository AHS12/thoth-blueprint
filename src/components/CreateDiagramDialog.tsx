import { Button } from "@/components/ui/button";
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
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { MySQLIcon } from "@/components/icons/MySQLIcon";
import { PostgreSQLIcon } from "@/components/icons/PostgreSQLIcon";
import { MSSQLIcon } from "@/components/icons/MSSQLIcon";
import { SQLiteIcon } from "@/components/icons/SQLiteIcon";
import { type DatabaseType } from "@/lib/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";

interface CreateDiagramDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onCreateDiagram: (values: { name: string; dbType: DatabaseType }) => void;
  existingDiagramNames: string[];
}

export function CreateDiagramDialog({ isOpen, onOpenChange, onCreateDiagram, existingDiagramNames }: CreateDiagramDialogProps) {
  const formSchema = z.object({
    name: z.string().min(1, "Diagram name is required").refine(
      (name) => !existingDiagramNames.includes(name),
      {
        message: "A diagram with this name already exists.",
      }
    ),
    dbType: z.enum(["mysql", "postgres", "sqlite"]),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      dbType: "mysql",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    onCreateDiagram({ name: values.name, dbType: values.dbType as DatabaseType });
    onOpenChange(false);
    form.reset();
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Diagram</DialogTitle>
          <DialogDescription>
            Give your new diagram a name and select the database type.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Diagram Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., E-commerce Schema" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dbType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Database Type</FormLabel>
                  <div className="grid grid-cols-2 gap-3">
                    {dbOptions.map((db) => {
                      const selected = field.value === db.key;
                      return (
                        <Card
                          key={db.key}
                          role="button"
                          aria-selected={selected}
                          onClick={() => field.onChange(db.key)}
                          className={cn(
                            "cursor-pointer transition border",
                            selected ? "border-primary ring-1 ring-primary" : "hover:border-primary/40"
                          )}
                        >
                          <CardHeader className="flex items-center gap-3 py-3">
                            {db.component}
                            <div>
                              <CardTitle className="text-base">{db.label}</CardTitle>
                              <CardDescription className="text-xs">Click to select</CardDescription>
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
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit">Create Diagram</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
  const dbOptions: { key: "mysql" | "postgres" | "sqlite"; label: string; component: React.ReactNode }[] = [
    { key: "mysql", label: "MySQL", component: <MySQLIcon className="h-6" /> },
    { key: "postgres", label: "PostgreSQL", component: <PostgreSQLIcon className="h-6" /> },
    { key: "sqlite", label: "SQLite", component: <SQLiteIcon className="h-6" /> },
  ];

  const comingSoonOptions: { key: "mssql"; label: string; component: React.ReactNode }[] = [
    { key: "mssql", label: "SQL Server", component: <MSSQLIcon className="h-6" /> },
  ];
