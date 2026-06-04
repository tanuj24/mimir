import { api } from "@/lib/api";

export interface Cluster {
  name: string;
  arn?: string;
  status?: string;
  runningTasks?: number;
  pendingTasks?: number;
  activeServices?: number;
  registeredContainerInstances?: number;
}
export interface Service {
  name: string;
  status?: string;
  desired?: number;
  running?: number;
  pending?: number;
  launchType?: string;
  taskDefinition?: string;
}

export const ecsApi = {
  clusters: (): Promise<{ clusters: Cluster[] }> => api.get("/ecs/clusters"),
  create: (name: string) => api.post("/ecs/clusters", { name }),
  remove: (name: string) => api.post("/ecs/clusters/delete", { name }),
  services: (cluster: string): Promise<{ services: Service[] }> =>
    api.get(`/ecs/clusters/services?cluster=${encodeURIComponent(cluster)}`),
};
