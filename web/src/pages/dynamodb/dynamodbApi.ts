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
  ): Promise<{ items: Record<string, unknown>[]; count: number; scannedCount: number }> =>
    api.get(`/dynamodb/tables/${encodeURIComponent(name)}/items`),
  putItem: (name: string, item: Record<string, unknown>) =>
    api.put(`/dynamodb/tables/${encodeURIComponent(name)}/items`, { item }),
  deleteItem: (name: string, key: Record<string, unknown>) =>
    api.post(`/dynamodb/tables/${encodeURIComponent(name)}/delete-item`, { key }),
};
