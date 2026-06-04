import { api } from "@/lib/api";

export interface Queue {
  url: string;
  name?: string;
}

export const sqsApi = {
  list: (): Promise<{ queues: Queue[] }> => api.get("/sqs/queues"),
  create: (name: string, fifo: boolean) => api.post("/sqs/queues", { name, fifo }),
  remove: (url: string) => api.post("/sqs/queues/delete", { url }),
  purge: (url: string) => api.post("/sqs/queues/purge", { url }),
  attributes: (url: string): Promise<{ attributes: Record<string, string> }> =>
    api.post("/sqs/queues/attributes", { url }),
  send: (url: string, body: string, groupId?: string): Promise<{ messageId: string }> =>
    api.post("/sqs/queues/send", { url, body, groupId }),
  receive: (
    url: string,
  ): Promise<{ messages: { messageId: string; body: string; receiptHandle: string }[] }> =>
    api.post("/sqs/queues/receive", { url }),
};
