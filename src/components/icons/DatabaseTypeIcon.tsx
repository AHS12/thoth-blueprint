import { type DatabaseType } from "@/lib/types";
import { MySQLIcon } from "./MySQLIcon";
import { PostgreSQLIcon } from "./PostgreSQLIcon";
import { SQLiteIcon } from "./SQLiteIcon";

interface DatabaseTypeIconProps {
  dbType: DatabaseType;
  className?: string;
}

export function DatabaseTypeIcon({ dbType, className = "h-4 w-auto" }: DatabaseTypeIconProps) {
  switch (dbType) {
    case "mysql":
      return <MySQLIcon className={className} />;
    case "postgres":
      return <PostgreSQLIcon className={className} />;
    case "sqlite":
      return <SQLiteIcon className={className} />;
    default:
      return null;
  }
}
