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

export interface CreateFunctionInput {
  name: string;
  runtime: string;
  handler: string;
  role?: string;
  memorySize?: number;
  timeout?: number;
  /** Inline source code (zipped server-side). Ignored when a zip file is given. */
  code?: string;
  /** Optional .zip deployment package. */
  file?: File | null;
  /** Environment variables as a plain object. */
  environment?: Record<string, string>;
}

export const lambdaApi = {
  list: (): Promise<{ functions: LambdaFn[] }> => api.get("/lambda/functions"),
  get: (name: string): Promise<LambdaFn & { environment: Record<string, string>; state?: string; role?: string }> =>
    api.get(`/lambda/functions/${encodeURIComponent(name)}`),
  remove: (name: string) => api.del(`/lambda/functions/${encodeURIComponent(name)}`),
  invoke: (name: string, payload: unknown): Promise<InvokeResult> =>
    api.post(`/lambda/functions/${encodeURIComponent(name)}/invoke`, { payload }),
  create: (input: CreateFunctionInput): Promise<{ name: string; arn: string; state: string }> => {
    const form = new FormData();
    form.set("name", input.name);
    form.set("runtime", input.runtime);
    form.set("handler", input.handler);
    if (input.role) form.set("role", input.role);
    if (input.memorySize != null) form.set("memorySize", String(input.memorySize));
    if (input.timeout != null) form.set("timeout", String(input.timeout));
    if (input.code) form.set("code", input.code);
    if (input.environment && Object.keys(input.environment).length)
      form.set("environment", JSON.stringify(input.environment));
    if (input.file) form.append("file", input.file);
    return api.upload("/lambda/functions", form);
  },
};
