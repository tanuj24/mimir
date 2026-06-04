import { api } from "@/lib/api";

export interface EksCluster {
  name: string;
  status?: string;
  version?: string;
  endpoint?: string;
  arn?: string;
  createdAt?: string;
  platformVersion?: string;
}

export const eksApi = {
  list: (): Promise<{ clusters: EksCluster[] }> => api.get("/eks/clusters"),
  get: (name: string): Promise<EksCluster & { nodegroups: string[]; roleArn?: string }> =>
    api.get(`/eks/clusters/${encodeURIComponent(name)}`),
  create: (name: string) => api.post("/eks/clusters", { name }),
  remove: (name: string) => api.post("/eks/clusters/delete", { name }),
};
