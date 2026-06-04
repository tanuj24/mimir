import { api } from "@/lib/api";

export interface KmsKey {
  keyId: string;
  arn?: string;
  aliases: string[];
  description?: string;
  state?: string;
  enabled?: boolean;
  usage?: string;
  spec?: string;
  creationDate?: string;
}

export const kmsApi = {
  list: (): Promise<{ keys: KmsKey[] }> => api.get("/kms/keys"),
  create: (description: string) => api.post("/kms/keys", { description }),
  setEnabled: (keyId: string, enabled: boolean) => api.post("/kms/keys/enable", { keyId, enabled }),
  scheduleDeletion: (keyId: string, days: number) =>
    api.post("/kms/keys/schedule-deletion", { keyId, days }),
};
