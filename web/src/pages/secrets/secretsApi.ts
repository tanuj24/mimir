import { api } from "@/lib/api";

export interface SecretSummary {
  name: string;
  arn: string;
  description?: string;
  lastChangedDate?: string;
}

export const secretsApi = {
  list: (): Promise<{ secrets: SecretSummary[] }> => api.get("/secrets/secrets"),
  value: (id: string): Promise<{ secretString: string | null; versionId: string }> =>
    api.get(`/secrets/secrets/value?id=${encodeURIComponent(id)}`),
  create: (name: string, secretString: string, description?: string) =>
    api.post("/secrets/secrets", { name, secretString, description }),
  putValue: (id: string, secretString: string) =>
    api.put("/secrets/secrets/value", { id, secretString }),
  remove: (id: string) => api.post("/secrets/secrets/delete", { id, force: true }),
};
