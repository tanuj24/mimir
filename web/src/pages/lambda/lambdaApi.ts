import { api } from "@/lib/api";

export interface LambdaFn {
  name: string;
  runtime?: string;
  handler?: string;
  memorySize?: number;
  timeout?: number;
  codeSize?: number;
  lastModified?: string;
  description?: string;
  arn?: string;
  packageType?: string;
}

export interface InvokeResult {
  statusCode?: number;
  functionError: string | null;
  executedVersion?: string;
  payload: string;
  logs: string;
}

export const lambdaApi = {
  list: (): Promise<{ functions: LambdaFn[] }> => api.get("/lambda/functions"),
  get: (name: string): Promise<LambdaFn & { environment: Record<string, string>; state?: string; role?: string }> =>
    api.get(`/lambda/functions/${encodeURIComponent(name)}`),
  remove: (name: string) => api.del(`/lambda/functions/${encodeURIComponent(name)}`),
  invoke: (name: string, payload: unknown): Promise<InvokeResult> =>
    api.post(`/lambda/functions/${encodeURIComponent(name)}/invoke`, { payload }),
};
