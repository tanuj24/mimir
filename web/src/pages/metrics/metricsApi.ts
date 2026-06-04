import { api } from "@/lib/api";

export interface Metric {
  namespace: string;
  name: string;
  dimensions: { name: string; value: string }[];
}
export interface DataPoint {
  timestamp?: string;
  average?: number;
  sum?: number;
  max?: number;
  min?: number;
}

export const metricsApi = {
  list: (namespace?: string): Promise<{ metrics: Metric[]; namespaces: string[] }> =>
    api.get(`/metrics/list${namespace ? `?namespace=${encodeURIComponent(namespace)}` : ""}`),
  statistics: (body: {
    namespace: string;
    metricName: string;
    dimensions?: { name: string; value: string }[];
  }): Promise<{ points: DataPoint[]; unit: string | null }> => api.post("/metrics/statistics", body),
};
