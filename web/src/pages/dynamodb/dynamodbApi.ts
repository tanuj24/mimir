import { api } from "@/lib/api";

export interface TableSummary {
  name: string;
}
export interface KeySchemaElement {
  AttributeName: string;
  KeyType: "HASH" | "RANGE";
}
export interface TableDetail {
  name: string;
  status: string;
  itemCount: number;
  sizeBytes: number;
  creationDate: string;
  keySchema: KeySchemaElement[];
  attributeDefinitions: { AttributeName: string; AttributeType: string }[];
  billingMode: string;
  gsis: { name: string; status: string }[];
  arn: string;
}

export const ddbApi = {
  listTables: (): Promise<{ tables: string[] }> => api.get("/dynamodb/tables"),
  describe: (name: string): Promise<TableDetail> =>
    api.get(`/dynamodb/tables/${encodeURIComponent(name)}`),
  createTable: (body: {
    name: string;
    partitionKey: string;
    partitionKeyType: string;
    sortKey?: string;
    sortKeyType?: string;
  }) => api.post("/dynamodb/tables", body),
  deleteTable: (name: string) => api.del(`/dynamodb/tables/${encodeURIComponent(name)}`),
  scan: (
    name: string,
    opts?: { limit?: number; startKey?: unknown },
  ): Promise<{
    items: Record<string, unknown>[];
    count: number;
    scannedCount: number;
    lastEvaluatedKey: unknown | null;
  }> => {
    const p = new URLSearchParams({ limit: String(opts?.limit ?? 50) });
    if (opts?.startKey) p.set("startKey", JSON.stringify(opts.startKey));
    return api.get(`/dynamodb/tables/${encodeURIComponent(name)}/items?${p}`);
  },
  putItem: (name: string, item: Record<string, unknown>) =>
    api.put(`/dynamodb/tables/${encodeURIComponent(name)}/items`, { item }),
  deleteItem: (name: string, key: Record<string, unknown>) =>
    api.post(`/dynamodb/tables/${encodeURIComponent(name)}/delete-item`, { key }),
};
