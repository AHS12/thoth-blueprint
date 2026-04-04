import Dexie, { type Table } from "dexie";
import { AppState, Diagram, DiagramCheckpoint } from "./types";

export class Database extends Dexie {
  diagrams!: Table<Diagram>;
  appState!: Table<AppState>;
  checkpoints!: Table<DiagramCheckpoint>;

  constructor() {
    super("ThothBlueprintDB");
    this.version(1).stores({
      diagrams: "++id, name, createdAt, updatedAt",
    });
    this.version(2)
      .stores({
        diagrams: "++id, name, dbType, createdAt, updatedAt",
      })
      .upgrade((tx) => {
        return tx
          .table("diagrams")
          .toCollection()
          .modify((diagram) => {
            diagram.dbType = "mysql"; // Default existing diagrams to mysql
          });
      });
    this.version(3)
      .stores({})
      .upgrade((tx) => {
        return tx
          .table("diagrams")
          .toCollection()
          .modify((diagram) => {
            if (diagram.data && typeof diagram.data.isLocked === "undefined") {
              diagram.data.isLocked = false;
            }
          });
      });
    this.version(4)
      .stores({
        diagrams: "++id, name, dbType, createdAt, updatedAt, deletedAt",
      })
      .upgrade((tx) => {
        return tx
          .table("diagrams")
          .toCollection()
          .modify((diagram) => {
            diagram.deletedAt = null;
          });
      });
    this.version(5).stores({
      diagrams: "++id, name, dbType, createdAt, updatedAt, deletedAt",
      appState: "key",
    });
    this.version(6)
      .stores({})
      .upgrade((tx) => {
        return tx
          .table("diagrams")
          .toCollection()
          .modify((diagram) => {
            if (diagram.data && typeof diagram.data.notes === "undefined") {
              diagram.data.notes = [];
            }
          });
      });
    this.version(7)
      .stores({})
      .upgrade((tx) => {
        return tx
          .table("diagrams")
          .toCollection()
          .modify((diagram) => {
            if (diagram.data && typeof diagram.data.zones === "undefined") {
              diagram.data.zones = [];
            }
          });
      });
    this.version(8).stores({
      diagrams: "++id, name, dbType, createdAt, updatedAt, deletedAt",
      appState: "key",
      checkpoints: "++id, diagramId, checkpointNumber, createdAt, type",
    });
  }
}

export const db = new Database();
