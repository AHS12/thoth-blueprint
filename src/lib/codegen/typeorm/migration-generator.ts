import { exportToSql } from "@/lib/exporter/sql-dbml-json-exporter";
import { type AppNode, type Diagram } from "@/lib/types";
import {
  generateTimestamp,
  toTypeOrmClassName,
  toTypeOrmTableName,
} from "./typeorm-helpers";

export interface TypeOrmMigrationOptions {
  timestamp?: string;
  omitForeignKeys?: boolean;
}

export interface TypeOrmMigrationFile {
  filename: string;
  content: string;
}

export function generateTypeOrmMigration(
  diagram: Diagram,
  options: TypeOrmMigrationOptions = {}
): TypeOrmMigrationFile[] {
  const { nodes, edges } = diagram.data;
  const timestamp = options.timestamp || generateTimestamp();

  const migrationFiles: TypeOrmMigrationFile[] = [];

  // Sort nodes by their order property to respect table serial from inspector
  const sortedNodes = nodes
    .filter((n) => !n.data.isDeleted)
    .sort((a, b) => {
      const orderA = a.data.order ?? 0;
      const orderB = b.data.order ?? 0;
      return orderA - orderB;
    });

  // Generate table creation migrations
  sortedNodes.forEach((node, index) => {
    const tableName = toTypeOrmTableName(node.data.label.trim());
    const className = toTypeOrmClassName(node.data.label.trim());
    const migrationTimestamp = timestamp + String(index).padStart(2, "0");
    const filename = `${migrationTimestamp}-${className}.ts`;
    const content = generateSingleTableMigration(
      node,
      tableName,
      className,
      migrationTimestamp,
      diagram
    );

    migrationFiles.push({ filename, content });
  });

  // Generate foreign key constraints migration if there are any edges
  if (!options.omitForeignKeys && edges.length > 0) {
    const fkTimestamp = timestamp + String(sortedNodes.length).padStart(2, "0");
    const fkFilename = `${fkTimestamp}-AddForeignKeyConstraints.ts`;
    const fkContent = generateForeignKeyMigration(fkTimestamp, diagram, options);

    migrationFiles.push({ filename: fkFilename, content: fkContent });
  }

  return migrationFiles;
}

export function generateTypeOrmMigrationString(
  diagram: Diagram,
  options: TypeOrmMigrationOptions = {}
): string {
  const files = generateTypeOrmMigration(diagram, options);

  if (files.length === 0) {
    return "// No tables found to generate migrations";
  }

  const output = `/*
 * TypeORM Migration Files Generated from ThothBlueprint
 * Generated on: ${new Date().toLocaleString()}
 * 
 * Instructions:
 * 1. Copy each migration block below into separate files in your TypeORM project
 * 2. Place them in the src/migrations/ directory (or your configured migrations path)
 * 3. Use the filename format shown in each comment
 * 4. Run 'npm run typeorm migration:run' to execute the migrations
 * 
 * Note: Each migration file is independent and includes all table structure
 */

`;

  return (
    output +
    files
      .map((f) => `// File: ${f.filename}\n${f.content}`)
      .join("\n\n" + "=".repeat(80) + "\n\n")
  );
}

function generateSingleTableMigration(
  node: AppNode,
  tableName: string,
  className: string,
  timestamp: string,
  diagram: Diagram
): string {
  // Generate SQL for just this table without any foreign key constraints
  const singleTableDiagram: Diagram = {
    ...diagram,
    data: {
      ...diagram.data,
      nodes: [node], // Only include this node
      edges: [], // No edges to avoid foreign key constraints
    },
  };

  const sql = exportToSql(singleTableDiagram);

  // Split SQL into individual statements and clean them
  const statements = sql
    .split(";")
    .map((stmt) => stmt.trim())
    .filter((stmt) => stmt.length > 0);

  // Find CREATE TABLE statement for this specific table
  const tableIdentifier =
    diagram.dbType === "mysql" ? `\`${tableName}\`` : `"${tableName}"`;
  const createTableSql =
    statements.find(
      (stmt) =>
        stmt.toUpperCase().startsWith("CREATE TABLE") &&
        stmt.includes(tableIdentifier)
    ) || "";

  // For PostgreSQL, find CREATE TYPE statements that this table needs
  const createTypeStatements = statements.filter((stmt) =>
    stmt.toUpperCase().startsWith("CREATE TYPE")
  );

  // Format the SQL statements
  const formattedCreateTableSql = formatSqlForTypeScript(createTableSql);

  let migration = `import { MigrationInterface, QueryRunner } from "typeorm";

export class ${className}${timestamp} implements MigrationInterface {
    name = '${className}${timestamp}';

    public async up(queryRunner: QueryRunner): Promise<void> {`;

  // Add CREATE TYPE statements first (for PostgreSQL enums)
  createTypeStatements.forEach((createTypeSql) => {
    const formattedCreateTypeSql = formatSqlForTypeScript(createTypeSql);
    migration += `
        await queryRunner.query(\`${formattedCreateTypeSql}\`);`;
  });

  // Then add the CREATE TABLE statement
  if (formattedCreateTableSql) {
    migration += `
        await queryRunner.query(\`${formattedCreateTableSql}\`);`;
  }

  migration += `
    }

    public async down(queryRunner: QueryRunner): Promise<void> {`;

  // Drop table first, then drop types
  const dropTableSql =
    diagram.dbType === "mysql"
      ? `DROP TABLE \\\`${tableName}\\\``
      : `DROP TABLE "${tableName}"`;

  migration += `
        await queryRunner.query(\`${dropTableSql}\`);`;

  // Drop the enum types in reverse order (for PostgreSQL)
  if (diagram.dbType === "postgres" && createTypeStatements.length > 0) {
    [...createTypeStatements].reverse().forEach((createTypeSql) => {
      // Extract type name from CREATE TYPE statement
      const typeMatch = createTypeSql.match(
        /CREATE TYPE\s+"?([^"\s]+)"?\s+AS/i
      );
      if (typeMatch && typeMatch[1]) {
        const typeName = typeMatch[1];
        migration += `
        await queryRunner.query(\`DROP TYPE "${typeName}"\`);`;
      }
    });
  }

  migration += `
    }
}`;

  return migration;
}

function generateForeignKeyMigration(
  timestamp: string,
  diagram: Diagram,
  options: TypeOrmMigrationOptions = {}
): string {
  // Generate SQL for all foreign key constraints
  const sql = exportToSql(diagram, { exportForeignKeyConstraint: !options.omitForeignKeys });

  // Split SQL into individual statements and clean them
  const statements = sql
    .split(";")
    .map((stmt) => stmt.trim())
    .filter((stmt) => stmt.length > 0);

  // Find all ALTER TABLE statements that add foreign keys
  const alterTableSqls = statements.filter(
    (stmt) =>
      stmt.toUpperCase().startsWith("ALTER TABLE") &&
      stmt.toUpperCase().includes("ADD") &&
      stmt.toUpperCase().includes("FOREIGN KEY")
  );

  let migration = `import { MigrationInterface, QueryRunner } from "typeorm";

export class AddForeignKeyConstraints${timestamp} implements MigrationInterface {
    name = 'AddForeignKeyConstraints${timestamp}';

    public async up(queryRunner: QueryRunner): Promise<void> {`;

  // Add all foreign key constraints
  alterTableSqls.forEach((alterSql) => {
    const formattedAlterSql = formatSqlForTypeScript(alterSql);
    migration += `
        await queryRunner.query(\`${formattedAlterSql}\`);`;
  });

  migration += `
    }

    public async down(queryRunner: QueryRunner): Promise<void> {`;

  // Drop all foreign key constraints in reverse order
  [...alterTableSqls].reverse().forEach((alterSql) => {
    // Extract table name from ALTER TABLE statement
    const tableMatch = alterSql.match(/ALTER TABLE\s+["`]?([^"`\s]+)["`]?/i);
    if (tableMatch && tableMatch[1]) {
      const tableName = tableMatch[1];
      const dropFkSql = generateDropForeignKeyStatement(alterSql, tableName);
      if (dropFkSql) {
        const formattedDropSql = formatSqlForTypeScript(dropFkSql);
        migration += `
        await queryRunner.query(\`${formattedDropSql}\`);`;
      }
    }
  });

  migration += `
    }
}`;

  return migration;
}

function formatSqlForTypeScript(sql: string): string {
  if (!sql) return "";

  // Escape backticks and dollar signs for template literals
  let formatted = sql.replace(/`/g, "\\`").replace(/\$/g, "\\$");

  // Clean up extra whitespace and keep on one line
  formatted = formatted
    .replace(/\s+/g, " ") // Replace multiple spaces with single space
    .replace(/;\s*$/, "") // Remove trailing semicolon
    .trim(); // Remove leading/trailing whitespace

  return formatted;
}

function generateDropForeignKeyStatement(
  alterSql: string,
  tableName: string
): string | null {
  // Extract foreign key constraint name from ALTER TABLE statement
  // Handle both quoted and unquoted constraint names
  const fkMatch = alterSql.match(
    /CONSTRAINT\s+["`]?([^"`\s]+)["`]?\s+FOREIGN\s+KEY/i
  );
  if (fkMatch) {
    const constraintName = fkMatch[1];
    // Use appropriate quoting based on database type
    if (alterSql.includes('"')) {
      // PostgreSQL style
      return `ALTER TABLE "${tableName}" DROP CONSTRAINT "${constraintName}";`;
    } else {
      // MySQL style
      return `ALTER TABLE \\\`${tableName}\\\` DROP FOREIGN KEY \\\`${constraintName}\\\`;`;
    }
  }
  return null;
}
