import { Router } from "express";
import multer from "multer";
import AdmZip from "adm-zip";
import {
  LambdaClient,
  CreateFunctionCommand,
  ListFunctionsCommand,
  GetFunctionCommand,
  DeleteFunctionCommand,
  InvokeCommand,
  ListAliasesCommand,
  waitUntilFunctionActiveV2,
} from "@aws-sdk/client-lambda";
import { makeClient } from "../aws/clientFactory.js";
import { asyncHandler, regionOf } from "../lib/http.js";

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
  // default: Node.js (ESM .mjs so "export const handler" works out of the box)
  const fn = handler.split(".")[1] || "handler";
  return {
    filename: `${moduleName || "index"}.mjs`,
    body: `export const ${fn} = async (event) => {\n  return { statusCode: 200, body: "Hello from Lambda!" };\n};\n`,
  };
}

export const lambdaRouter = Router();

// Create a function. Accepts either an uploaded .zip ("file") or inline source
// ("code"), which we zip on the fly. multipart/form-data so a zip can ride along.
lambdaRouter.post(
  "/functions",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const {
      name,
      runtime,
      handler,
      role,
      memorySize,
      timeout,
      code,
      environment,
    } = req.body as {
      name?: string;
      runtime?: string;
      handler?: string;
      role?: string;
      memorySize?: string;
      timeout?: string;
      code?: string;
      environment?: string;
    };

    if (!name) return res.status(400).json({ error: { code: "BadRequest", message: "name is required" } });
    const rt = runtime || "nodejs20.x";
    const hdl = handler || (rt.startsWith("python") ? "lambda_function.lambda_handler" : "index.handler");

    // Resolve the code zip: uploaded file wins, else zip the inline source.
    let zipBuffer: Buffer;
    if (req.file) {
      zipBuffer = req.file.buffer;
    } else {
      const tmpl = inlineTemplate(rt, hdl);
      const zip = new AdmZip();
      zip.addFile(tmpl.filename, Buffer.from(code && code.trim() ? code : tmpl.body, "utf-8"));
      zipBuffer = zip.toBuffer();
    }

    let envVars: Record<string, string> | undefined;
    if (environment) {
      try {
        const parsed = JSON.parse(environment);
        if (parsed && typeof parsed === "object") envVars = parsed as Record<string, string>;
      } catch {
        return res.status(400).json({ error: { code: "BadRequest", message: "environment must be valid JSON" } });
      }
    }

    const c = client(req);
    const out = await c.send(
      new CreateFunctionCommand({
        FunctionName: name,
        Runtime: rt as never,
        Handler: hdl,
        Role: role || "arn:aws:iam::000000000000:role/lambda-role",
        Code: { ZipFile: zipBuffer },
        MemorySize: memorySize ? Number(memorySize) : 128,
        Timeout: timeout ? Number(timeout) : 3,
        Environment: envVars ? { Variables: envVars } : undefined,
      }),
    );

    // Best-effort wait so the function is invokable by the time the UI refreshes.
    await waitUntilFunctionActiveV2(
      { client: c, maxWaitTime: 30 },
      { FunctionName: name },
    ).catch(() => undefined);

    res.status(201).json({ name: out.FunctionName, arn: out.FunctionArn, state: out.State });
  }),
);

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
      })),
    });
  }),
);

lambdaRouter.get(
  "/functions/:name",
  asyncHandler(async (req, res) => {
    const out = await client(req).send(new GetFunctionCommand({ FunctionName: req.params.name }));
    const c = out.Configuration;
    const aliases = await client(req)
      .send(new ListAliasesCommand({ FunctionName: req.params.name }))
      .catch(() => ({ Aliases: [] }));
    res.json({
      name: c?.FunctionName,
      runtime: c?.Runtime,
      handler: c?.Handler,
      memorySize: c?.MemorySize,
      timeout: c?.Timeout,
      codeSize: c?.CodeSize,
      lastModified: c?.LastModified,
      description: c?.Description,
      role: c?.Role,
      arn: c?.FunctionArn,
      state: c?.State,
      packageType: c?.PackageType,
      environment: c?.Environment?.Variables ?? {},
      aliases: (aliases.Aliases ?? []).map((a) => ({ name: a.Name, version: a.FunctionVersion })),
    });
  }),
);

lambdaRouter.delete(
  "/functions/:name",
  asyncHandler(async (req, res) => {
    await client(req).send(new DeleteFunctionCommand({ FunctionName: req.params.name }));
    res.status(204).end();
  }),
);

lambdaRouter.post(
  "/functions/:name/invoke",
  asyncHandler(async (req, res) => {
    const { payload } = req.body as { payload?: unknown };
    const out = await client(req).send(
      new InvokeCommand({
        FunctionName: req.params.name,
        Payload: payload !== undefined ? Buffer.from(JSON.stringify(payload)) : undefined,
        LogType: "Tail",
      }),
    );
    const responsePayload = out.Payload ? Buffer.from(out.Payload).toString("utf-8") : "";
    const logs = out.LogResult ? Buffer.from(out.LogResult, "base64").toString("utf-8") : "";
    res.json({
      statusCode: out.StatusCode,
      functionError: out.FunctionError ?? null,
      executedVersion: out.ExecutedVersion,
      payload: responsePayload,
      logs,
    });
  }),
);
