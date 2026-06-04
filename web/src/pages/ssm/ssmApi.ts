import { api } from "@/lib/api";

export interface Parameter {
  name: string;
  type?: string;
  version?: number;
  lastModifiedDate?: string;
  description?: string;
  tier?: string;
}

export const ssmApi = {
  list: (): Promise<{ parameters: Parameter[] }> => api.get("/ssm/parameters"),
  value: (name: string): Promise<{ name: string; value: string; type: string; version: number }> =>
    api.get(`/ssm/parameters/value?name=${encodeURIComponent(name)}`),
  put: (body: { name: string; value: string; type: string; description?: string }) =>
    api.put("/ssm/parameters", body),
  remove: (name: string) => api.post("/ssm/parameters/delete", { name }),
};
