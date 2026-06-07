import { api } from "@/lib/api";

export interface AthenaDatabase {
  name: string;
  description?: string;
}

export interface AthenaTable {
  name: string;
  tableType?: string;
  location?: string;
  columns: { name: string; type: string }[];
}

export interface QueryExecution {
  id: string;
  sql: string;
  state: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  database?: string;
  submittedAt?: string;
  completedAt?: string;
  executionMs?: number;
  scannedBytes?: number;
  error?: string;
  results?: { columns: string[]; rows: string[][] };
}

export const athenaApi = {
  databases: (): Promise<{ databases: AthenaDatabase[] }> =>
    api.get("/athena/databases"),

  tables: (db: string): Promise<{ tables: AthenaTable[] }> =>
    api.get(`/athena/databases/${encodeURIComponent(db)}/tables`),

  startQuery: (sql: string, database?: string): Promise<{ queryExecutionId: string }> =>
    api.post("/athena/queries", { sql, database }),

  getQuery: (id: string): Promise<QueryExecution> =>
    api.get(`/athena/queries/${encodeURIComponent(id)}`),

  listQueries: (): Promise<{ executions: QueryExecution[] }> =>
    api.get("/athena/queries"),

  stopQuery: (id: string): Promise<null> =>
    api.del(`/athena/queries/${encodeURIComponent(id)}`),
};
