import { Router } from "express";
import multer from "multer";
import AdmZip from "adm-zip";
import {
  LambdaClient,
  CreateFunctionCommand,
  ListFunctionsCommand,
  GetFunctionCommand,
  GetFunctionConfigurationCommand,
  UpdateFunctionConfigurationCommand,
  UpdateFunctionCodeCommand,
  DeleteFunctionCommand,
  InvokeCommand,
  PublishVersionCommand,
  ListVersionsByFunctionCommand,
  ListAliasesCommand,
  CreateAliasCommand,
  DeleteAliasCommand,
  GetFunctionConcurrencyCommand,
  PutFunctionConcurrencyCommand,
  DeleteFunctionConcurrencyCommand,
  CreateFunctionUrlConfigCommand,
  GetFunctionUrlConfigCommand,
  UpdateFunctionUrlConfigCommand,
  DeleteFunctionUrlConfigCommand,
  ListTagsCommand,
  TagResourceCommand,
  UntagResourceCommand,
  GetFunctionEventInvokeConfigCommand,
  PutFunctionEventInvokeConfigCommand,
  ListEventSourceMappingsCommand,
  CreateEventSourceMappingCommand,
  DeleteEventSourceMappingCommand,
  waitUntilFunctionActiveV2,
  waitUntilFunctionUpdatedV2,
} from "@aws-sdk/client-lambda";
import { makeClient } from "../aws/clientFactory.js";
import { asyncHandler, regionOf } from "../lib/http.js";
import { ensureLogGroup } from "../glue/cwLogs.js";

const upload = multer({ storage: multer.memoryStorage() });

function client(req: { header(n: string): string | undefined }) {
  return makeClient(LambdaClient, { region: regionOf(req as never) });
}

/**
 * Picks a source filename + a working starter handler for inline code, based on
 * the chosen runtime and handler string (e.g. "index.handler" → file "index").
 */
function inlineTemplate(runtime: string, handler: string): { filename: string; body: string } {
  const moduleName = (handler.split(".")[0] || "index").trim();
  if (runtime.startsWith("python")) {
    const fn = handler.split(".")[1] || "lambda_handler";
    return {
      filename: `${moduleName || "lambda_function"}.py`,
      body: `def ${fn}(event, context):\n    return {"statusCode": 200, "body": "Hello from Lambda!"}\n`,
    };
  }
  if (runtime.startsWith("ruby")) {
    const fn = handler.split(".")[1] || "handler";
    return {
      filename: `${moduleName || "function"}.rb`,
      body: `def ${fn}(event:, context:)\n  { statusCode: 200, body: "Hello from Lambda!" }\nend\n`,
    };
  }
  // default: Node.js (ESM .mjs so "export const handler" works out of the box)
  const fn = handler.split(".")[1] || "handler";
  return {
    filename: `${moduleName || "index"}.mjs`,
    body: `export const ${fn} = async (event) => {\n  return { statusCode: 200, body: "Hello from Lambda!" };\n};\n`,
  };
}

/** Build a deployment zip from an uploaded file or inline source. */
function resolveZip(
  file: Express.Multer.File | undefined,
  code: string | undefined,
  runtime: string,
  handler: string,
): Buffer {
  if (file) return file.buffer;
  const tmpl = inlineTemplate(runtime, handler);
  const zip = new AdmZip();
  zip.addFile(tmpl.filename, Buffer.from(code && code.trim() ? code : tmpl.body, "utf-8"));
  return zip.toBuffer();
}

function parseEnv(environment: string | undefined): Record<string, string> | undefined {
  if (!environment) return undefined;
  const parsed = JSON.parse(environment);
  if (parsed && typeof parsed === "object") return parsed as Record<string, string>;
  return undefined;
}

export const lambdaRouter = Router();

// ---------------------------------------------------------------- create
lambdaRouter.post(
  "/functions",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const b = req.body as Record<string, string>;
    if (!b.name) return res.status(400).json({ error: { code: "BadRequest", message: "name is required" } });
    const rt = b.runtime || "nodejs20.x";
    const hdl = b.handler || (rt.startsWith("python") ? "lambda_function.lambda_handler" : "index.handler");

    let envVars: Record<string, string> | undefined;
    try {
      envVars = parseEnv(b.environment);
    } catch {
      return res.status(400).json({ error: { code: "BadRequest", message: "environment must be valid JSON" } });
    }

    const arch = b.architecture && (b.architecture === "arm64" || b.architecture === "x86_64") ? b.architecture : undefined;
    const c = client(req);
    const out = await c.send(
      new CreateFunctionCommand({
        FunctionName: b.name,
        Runtime: rt as never,
        Handler: hdl,
        Role: b.role || "arn:aws:iam::000000000000:role/lambda-role",
        Code: { ZipFile: resolveZip(req.file, b.code, rt, hdl) },
        MemorySize: b.memorySize ? Number(b.memorySize) : 128,
        Timeout: b.timeout ? Number(b.timeout) : 3,
        Description: b.description || undefined,
        Architectures: arch ? [arch] : undefined,
        EphemeralStorage: b.ephemeralStorage ? { Size: Number(b.ephemeralStorage) } : undefined,
        Environment: envVars ? { Variables: envVars } : undefined,
      }),
    );

    // Best-effort wait so the function is invokable by the time the UI refreshes.
    await waitUntilFunctionActiveV2({ client: c, maxWaitTime: 30 }, { FunctionName: b.name }).catch(() => undefined);
    // Create the function's CloudWatch log group, matching what AWS does on first deploy.
    ensureLogGroup(`/aws/lambda/${b.name}`).catch(() => {});
    res.status(201).json({ name: out.FunctionName, arn: out.FunctionArn, state: out.State });
  }),
);

// ---------------------------------------------------------------- list
lambdaRouter.get(
  "/functions",
  asyncHandler(async (req, res) => {
    const out = await client(req).send(new ListFunctionsCommand({ MaxItems: 100 }));
    res.json({
      functions: (out.Functions ?? []).map((f) => ({
        name: f.FunctionName,
        runtime: f.Runtime,
        handler: f.Handler,
        memorySize: f.MemorySize,
        timeout: f.Timeout,
        codeSize: f.CodeSize,
        lastModified: f.LastModified,
        description: f.Description,
        arn: f.FunctionArn,
        packageType: f.PackageType,
        architectures: f.Architectures,
      })),
    });
  }),
);

// ---------------------------------------------------------------- detail (aggregated)
lambdaRouter.get(
  "/functions/:name",
  asyncHandler(async (req, res) => {
    const name = req.params.name;
    const c = client(req);
    const fn = await c.send(new GetFunctionCommand({ FunctionName: name }));
    const cfg = fn.Configuration;
    const arn = cfg?.FunctionArn;

    // Side configs are best-effort: not every function has each one set.
    const [concurrency, urlCfg, tags, aliases, asyncCfg] = await Promise.all([
      c.send(new GetFunctionConcurrencyCommand({ FunctionName: name })).catch(() => undefined),
      c.send(new GetFunctionUrlConfigCommand({ FunctionName: name })).catch(() => undefined),
      arn ? c.send(new ListTagsCommand({ Resource: arn })).catch(() => undefined) : undefined,
      c.send(new ListAliasesCommand({ FunctionName: name })).catch(() => ({ Aliases: [] })),
      c.send(new GetFunctionEventInvokeConfigCommand({ FunctionName: name })).catch(() => undefined),
    ]);

    res.json({
      name: cfg?.FunctionName,
      runtime: cfg?.Runtime,
      handler: cfg?.Handler,
      memorySize: cfg?.MemorySize,
      timeout: cfg?.Timeout,
      ephemeralStorage: cfg?.EphemeralStorage?.Size,
      architectures: cfg?.Architectures,
      codeSize: cfg?.CodeSize,
      lastModified: cfg?.LastModified,
      description: cfg?.Description,
      role: cfg?.Role,
      arn,
      version: cfg?.Version,
      state: cfg?.State,
      lastUpdateStatus: cfg?.LastUpdateStatus,
      packageType: cfg?.PackageType,
      tracingMode: cfg?.TracingConfig?.Mode,
      deadLetterArn: cfg?.DeadLetterConfig?.TargetArn,
      environment: cfg?.Environment?.Variables ?? {},
      codeLocation: fn.Code?.Location,
      reservedConcurrency: concurrency?.ReservedConcurrentExecutions ?? null,
      functionUrl: urlCfg ? { url: urlCfg.FunctionUrl, authType: urlCfg.AuthType } : null,
      tags: tags?.Tags ?? {},
      asyncConfig: asyncCfg
        ? {
            maxRetryAttempts: asyncCfg.MaximumRetryAttempts ?? null,
            maxEventAgeSeconds: asyncCfg.MaximumEventAgeInSeconds ?? null,
          }
        : null,
      aliases: (aliases?.Aliases ?? []).map((a) => ({ name: a.Name, version: a.FunctionVersion })),
    });
  }),
);

// ---------------------------------------------------------------- update configuration
lambdaRouter.patch(
  "/functions/:name/config",
  asyncHandler(async (req, res) => {
    const name = req.params.name;
    const b = req.body as {
      memorySize?: number;
      timeout?: number;
      handler?: string;
      runtime?: string;
      description?: string;
      ephemeralStorage?: number;
      environment?: Record<string, string>;
      tracingMode?: "Active" | "PassThrough";
      deadLetterArn?: string | null;
    };
    const c = client(req);
    await c.send(
      new UpdateFunctionConfigurationCommand({
        FunctionName: name,
        MemorySize: b.memorySize,
        Timeout: b.timeout,
        Handler: b.handler,
        Runtime: b.runtime as never,
        Description: b.description,
        EphemeralStorage: b.ephemeralStorage ? { Size: b.ephemeralStorage } : undefined,
        Environment: b.environment ? { Variables: b.environment } : undefined,
        TracingConfig: b.tracingMode ? { Mode: b.tracingMode } : undefined,
        DeadLetterConfig:
          b.deadLetterArn === undefined ? undefined : { TargetArn: b.deadLetterArn ?? "" },
      }),
    );
    await waitUntilFunctionUpdatedV2({ client: c, maxWaitTime: 30 }, { FunctionName: name }).catch(() => undefined);
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------- update code
lambdaRouter.put(
  "/functions/:name/code",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const name = req.params.name;
    const b = req.body as { code?: string; runtime?: string; handler?: string; architecture?: string };
    const c = client(req);
    const arch = b.architecture === "arm64" || b.architecture === "x86_64" ? b.architecture : undefined;
    await c.send(
      new UpdateFunctionCodeCommand({
        FunctionName: name,
        ZipFile: resolveZip(req.file, b.code, b.runtime || "nodejs20.x", b.handler || "index.handler"),
        Architectures: arch ? [arch] : undefined,
      }),
    );
    await waitUntilFunctionUpdatedV2({ client: c, maxWaitTime: 30 }, { FunctionName: name }).catch(() => undefined);
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------- delete
lambdaRouter.delete(
  "/functions/:name",
  asyncHandler(async (req, res) => {
    await client(req).send(new DeleteFunctionCommand({ FunctionName: req.params.name }));
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------- invoke
lambdaRouter.post(
  "/functions/:name/invoke",
  asyncHandler(async (req, res) => {
    const { payload, qualifier } = req.body as { payload?: unknown; qualifier?: string };
    const out = await client(req).send(
      new InvokeCommand({
        FunctionName: req.params.name,
        Qualifier: qualifier || undefined,
        Payload: payload !== undefined ? Buffer.from(JSON.stringify(payload)) : undefined,
        LogType: "Tail",
      }),
    );
    res.json({
      statusCode: out.StatusCode,
      functionError: out.FunctionError ?? null,
      executedVersion: out.ExecutedVersion,
      payload: out.Payload ? Buffer.from(out.Payload).toString("utf-8") : "",
      logs: out.LogResult ? Buffer.from(out.LogResult, "base64").toString("utf-8") : "",
    });
  }),
);

// ---------------------------------------------------------------- versions & aliases
lambdaRouter.post(
  "/functions/:name/publish",
  asyncHandler(async (req, res) => {
    const { description } = req.body as { description?: string };
    const out = await client(req).send(
      new PublishVersionCommand({ FunctionName: req.params.name, Description: description || undefined }),
    );
    res.status(201).json({ version: out.Version });
  }),
);

lambdaRouter.get(
  "/functions/:name/versions",
  asyncHandler(async (req, res) => {
    const out = await client(req).send(new ListVersionsByFunctionCommand({ FunctionName: req.params.name }));
    res.json({
      versions: (out.Versions ?? []).map((v) => ({
        version: v.Version,
        description: v.Description,
        lastModified: v.LastModified,
        codeSize: v.CodeSize,
      })),
    });
  }),
);

lambdaRouter.post(
  "/functions/:name/aliases",
  asyncHandler(async (req, res) => {
    const { name, version, description } = req.body as { name: string; version: string; description?: string };
    const out = await client(req).send(
      new CreateAliasCommand({
        FunctionName: req.params.name,
        Name: name,
        FunctionVersion: version,
        Description: description || undefined,
      }),
    );
    res.status(201).json({ name: out.Name, version: out.FunctionVersion });
  }),
);

lambdaRouter.delete(
  "/functions/:name/aliases/:alias",
  asyncHandler(async (req, res) => {
    await client(req).send(new DeleteAliasCommand({ FunctionName: req.params.name, Name: req.params.alias }));
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------- reserved concurrency
lambdaRouter.put(
  "/functions/:name/concurrency",
  asyncHandler(async (req, res) => {
    const { reserved } = req.body as { reserved: number };
    await client(req).send(
      new PutFunctionConcurrencyCommand({
        FunctionName: req.params.name,
        ReservedConcurrentExecutions: Number(reserved),
      }),
    );
    res.json({ ok: true });
  }),
);

lambdaRouter.delete(
  "/functions/:name/concurrency",
  asyncHandler(async (req, res) => {
    await client(req).send(new DeleteFunctionConcurrencyCommand({ FunctionName: req.params.name }));
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------- function URL
lambdaRouter.put(
  "/functions/:name/url",
  asyncHandler(async (req, res) => {
    const { authType } = req.body as { authType?: string };
    const name = req.params.name;
    const c = client(req);
    const auth = (authType === "AWS_IAM" ? "AWS_IAM" : "NONE") as never;
    // Create, or update if it already exists.
    const out = await c
      .send(new CreateFunctionUrlConfigCommand({ FunctionName: name, AuthType: auth }))
      .catch(() => c.send(new UpdateFunctionUrlConfigCommand({ FunctionName: name, AuthType: auth })));
    res.json({ url: out.FunctionUrl, authType: out.AuthType });
  }),
);

lambdaRouter.delete(
  "/functions/:name/url",
  asyncHandler(async (req, res) => {
    await client(req).send(new DeleteFunctionUrlConfigCommand({ FunctionName: req.params.name }));
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------- tags
lambdaRouter.put(
  "/functions/:name/tags",
  asyncHandler(async (req, res) => {
    const { tags, arn } = req.body as { tags: Record<string, string>; arn: string };
    const c = client(req);
    const existing = await c.send(new ListTagsCommand({ Resource: arn })).catch(() => ({ Tags: {} as Record<string, string> }));
    const toRemove = Object.keys(existing.Tags ?? {}).filter((k) => !(k in tags));
    if (toRemove.length) await c.send(new UntagResourceCommand({ Resource: arn, TagKeys: toRemove }));
    if (Object.keys(tags).length) await c.send(new TagResourceCommand({ Resource: arn, Tags: tags }));
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------- async invoke config
lambdaRouter.put(
  "/functions/:name/async-config",
  asyncHandler(async (req, res) => {
    const { maxRetryAttempts, maxEventAgeSeconds } = req.body as {
      maxRetryAttempts?: number;
      maxEventAgeSeconds?: number;
    };
    await client(req).send(
      new PutFunctionEventInvokeConfigCommand({
        FunctionName: req.params.name,
        MaximumRetryAttempts: maxRetryAttempts,
        MaximumEventAgeInSeconds: maxEventAgeSeconds,
      }),
    );
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------- triggers (event source mappings)
lambdaRouter.get(
  "/functions/:name/triggers",
  asyncHandler(async (req, res) => {
    const out = await client(req).send(new ListEventSourceMappingsCommand({ FunctionName: req.params.name }));
    res.json({
      triggers: (out.EventSourceMappings ?? []).map((m) => ({
        uuid: m.UUID,
        eventSourceArn: m.EventSourceArn,
        state: m.State,
        batchSize: m.BatchSize,
        enabled: m.State === "Enabled",
      })),
    });
  }),
);

lambdaRouter.post(
  "/functions/:name/triggers",
  asyncHandler(async (req, res) => {
    const { eventSourceArn, batchSize, enabled } = req.body as {
      eventSourceArn: string;
      batchSize?: number;
      enabled?: boolean;
    };
    const out = await client(req).send(
      new CreateEventSourceMappingCommand({
        FunctionName: req.params.name,
        EventSourceArn: eventSourceArn,
        BatchSize: batchSize ?? 10,
        Enabled: enabled ?? true,
      }),
    );
    res.status(201).json({ uuid: out.UUID, state: out.State });
  }),
);

lambdaRouter.delete(
  "/functions/:name/triggers/:uuid",
  asyncHandler(async (req, res) => {
    await client(req).send(new DeleteEventSourceMappingCommand({ UUID: req.params.uuid }));
    res.status(204).end();
  }),
);
