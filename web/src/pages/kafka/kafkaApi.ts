import { api } from "@/lib/api";

export interface KafkaCluster {
  name: string;
  arn: string;
  state?: string;
  type?: string;
  creationTime?: string;
  kafkaVersion?: string;
  brokers?: number;
}

export interface CreateClusterInput {
  name: string;
  kafkaVersion: string;
  brokers: number;
  instanceType: string;
}

export const kafkaApi = {
  list: (): Promise<{ clusters: KafkaCluster[] }> => api.get("/kafka/clusters"),
  describe: (
    arn: string,
  ): Promise<{ name: string; state: string; type: string; bootstrapBrokers: string | null; creationTime: string }> =>
    api.get(`/kafka/clusters/describe?arn=${encodeURIComponent(arn)}`),
  create: (input: CreateClusterInput): Promise<{ name: string; arn: string; state: string }> =>
    api.post("/kafka/clusters", input),
  remove: (arn: string) => api.post("/kafka/clusters/delete", { arn }),
};
