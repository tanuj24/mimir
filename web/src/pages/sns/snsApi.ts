import { api } from "@/lib/api";

export interface Topic {
  arn: string;
  name?: string;
}

export const snsApi = {
  list: (): Promise<{ topics: Topic[] }> => api.get("/sns/topics"),
  create: (name: string, fifo: boolean) => api.post("/sns/topics", { name, fifo }),
  remove: (arn: string) => api.post("/sns/topics/delete", { arn }),
  details: (
    arn: string,
  ): Promise<{
    attributes: Record<string, string>;
    subscriptions: { arn: string; protocol: string; endpoint: string }[];
  }> => api.post("/sns/topics/attributes", { arn }),
  subscribe: (arn: string, protocol: string, endpoint: string) =>
    api.post("/sns/topics/subscribe", { arn, protocol, endpoint }),
  unsubscribe: (subscriptionArn: string) => api.post("/sns/topics/unsubscribe", { subscriptionArn }),
  publish: (arn: string, message: string, subject?: string, groupId?: string): Promise<{ messageId: string }> =>
    api.post("/sns/topics/publish", { arn, message, subject, groupId }),
};
