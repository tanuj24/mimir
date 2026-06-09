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
  architectures?: string[];
}

export interface LambdaDetail extends LambdaFn {
  ephemeralStorage?: number;
  role?: string;
  version?: string;
  state?: string;
  lastUpdateStatus?: string;
  tracingMode?: string;
  deadLetterArn?: string;
  environment: Record<string, string>;
  codeLocation?: string;
  reservedConcurrency: number | null;
  functionUrl: { url?: string; authType?: string } | null;
  tags: Record<string, string>;
  asyncConfig: { maxRetryAttempts: number | null; maxEventAgeSeconds: number | null } | null;
  aliases: { name?: string; version?: string }[];
}

export interface InvokeResult {
  statusCode?: number;
  functionError: string | null;
  executedVersion?: string;
  payload: string;
  logs: string;
}

export interface LambdaVersion {
  version?: string;
  description?: string;
  lastModified?: string;
  codeSize?: number;
}

export interface LambdaTrigger {
  uuid?: string;
  eventSourceArn?: string;
  state?: string;
  batchSize?: number;
  enabled?: boolean;
}

export interface CreateFunctionInput {
  name: string;
  runtime: string;
  handler: string;
  role?: string;
  memorySize?: number;
  timeout?: number;
  ephemeralStorage?: number;
  architecture?: string;
  description?: string;
  code?: string;
  file?: File | null;
  environment?: Record<string, string>;
}

export interface ConfigInput {
  memorySize?: number;
  timeout?: number;
  handler?: string;
  runtime?: string;
  description?: string;
  ephemeralStorage?: number;
  environment?: Record<string, string>;
  tracingMode?: "Active" | "PassThrough";
  deadLetterArn?: string | null;
}

const enc = encodeURIComponent;

export const lambdaApi = {
  list: (): Promise<{ functions: LambdaFn[] }> => api.get("/lambda/functions"),
  get: (name: string): Promise<LambdaDetail> => api.get(`/lambda/functions/${enc(name)}`),
  remove: (name: string) => api.del(`/lambda/functions/${enc(name)}`),
  invoke: (name: string, payload: unknown, qualifier?: string): Promise<InvokeResult> =>
    api.post(`/lambda/functions/${enc(name)}/invoke`, { payload, qualifier }),

  create: (input: CreateFunctionInput): Promise<{ name: string; arn: string; state: string }> => {
    const form = new FormData();
    form.set("name", input.name);
    form.set("runtime", input.runtime);
    form.set("handler", input.handler);
    if (input.role) form.set("role", input.role);
    if (input.memorySize != null) form.set("memorySize", String(input.memorySize));
    if (input.timeout != null) form.set("timeout", String(input.timeout));
    if (input.ephemeralStorage != null) form.set("ephemeralStorage", String(input.ephemeralStorage));
    if (input.architecture) form.set("architecture", input.architecture);
    if (input.description) form.set("description", input.description);
    if (input.code) form.set("code", input.code);
    if (input.environment && Object.keys(input.environment).length)
      form.set("environment", JSON.stringify(input.environment));
    if (input.file) form.append("file", input.file);
    return api.upload("/lambda/functions", form);
  },

  updateConfig: (name: string, cfg: ConfigInput) => api.patch(`/lambda/functions/${enc(name)}/config`, cfg),

  updateCode: (name: string, opts: { code?: string; file?: File | null; runtime?: string; handler?: string; architecture?: string }) => {
    const form = new FormData();
    if (opts.code) form.set("code", opts.code);
    if (opts.runtime) form.set("runtime", opts.runtime);
    if (opts.handler) form.set("handler", opts.handler);
    if (opts.architecture) form.set("architecture", opts.architecture);
    if (opts.file) form.append("file", opts.file);
    return api.upload(`/lambda/functions/${enc(name)}/code`, form, "PUT");
  },

  publish: (name: string, description?: string): Promise<{ version: string }> =>
    api.post(`/lambda/functions/${enc(name)}/publish`, { description }),
  versions: (name: string): Promise<{ versions: LambdaVersion[] }> =>
    api.get(`/lambda/functions/${enc(name)}/versions`),
  createAlias: (name: string, alias: { name: string; version: string; description?: string }) =>
    api.post(`/lambda/functions/${enc(name)}/aliases`, alias),
  deleteAlias: (name: string, alias: string) => api.del(`/lambda/functions/${enc(name)}/aliases/${enc(alias)}`),

  setConcurrency: (name: string, reserved: number) =>
    api.put(`/lambda/functions/${enc(name)}/concurrency`, { reserved }),
  clearConcurrency: (name: string) => api.del(`/lambda/functions/${enc(name)}/concurrency`),

  setUrl: (name: string, authType: string): Promise<{ url: string; authType: string }> =>
    api.put(`/lambda/functions/${enc(name)}/url`, { authType }),
  deleteUrl: (name: string) => api.del(`/lambda/functions/${enc(name)}/url`),

  setTags: (name: string, arn: string, tags: Record<string, string>) =>
    api.put(`/lambda/functions/${enc(name)}/tags`, { arn, tags }),

  setAsyncConfig: (name: string, cfg: { maxRetryAttempts?: number; maxEventAgeSeconds?: number }) =>
    api.put(`/lambda/functions/${enc(name)}/async-config`, cfg),

  triggers: (name: string): Promise<{ triggers: LambdaTrigger[] }> =>
    api.get(`/lambda/functions/${enc(name)}/triggers`),
  createTrigger: (name: string, eventSourceArn: string, batchSize?: number) =>
    api.post(`/lambda/functions/${enc(name)}/triggers`, { eventSourceArn, batchSize }),
  deleteTrigger: (name: string, uuid: string) => api.del(`/lambda/functions/${enc(name)}/triggers/${enc(uuid)}`),
};

export const RUNTIMES = [
  "nodejs22.x",
  "nodejs20.x",
  "nodejs18.x",
  "python3.13",
  "python3.12",
  "python3.11",
  "python3.9",
  "ruby3.3",
  "java21",
  "java17",
  "provided.al2023",
];

export const ARCHITECTURES = ["x86_64", "arm64"];

export function runtimeDefaults(runtime: string): { handler: string; code: string } {
  if (runtime.startsWith("python")) {
    return {
      handler: "lambda_function.lambda_handler",
      code: `def lambda_handler(event, context):\n    return {"statusCode": 200, "body": "Hello from Lambda!"}\n`,
    };
  }
  if (runtime.startsWith("ruby")) {
    return {
      handler: "function.handler",
      code: `def handler(event:, context:)\n  { statusCode: 200, body: "Hello from Lambda!" }\nend\n`,
    };
  }
  return {
    handler: "index.handler",
    code: `export const handler = async (event) => {\n  return { statusCode: 200, body: "Hello from Lambda!" };\n};\n`,
  };
}

export function runtimeLanguage(runtime: string): string {
  if (runtime.startsWith("python")) return "python";
  if (runtime.startsWith("nodejs")) return "javascript";
  if (runtime.startsWith("ruby")) return "ruby";
  if (runtime.startsWith("java")) return "java";
  return "plaintext";
}
